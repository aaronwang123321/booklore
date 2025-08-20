import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { AdminDashboardService } from '../services/admin-dashboard.service';
import { PaymentAnalyticsService } from '../services/payment-analytics.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

@ApiTags('Admin Dashboard')
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth()
export class AdminDashboardController {
  private readonly logger = new Logger(AdminDashboardController.name);

  constructor(
    private readonly adminDashboardService: AdminDashboardService,
    private readonly paymentAnalyticsService: PaymentAnalyticsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: '获取仪表板概览数据' })
  @ApiResponse({ status: 200, description: '成功获取概览数据' })
  async getDashboardOverview() {
    try {
      const overview = await this.adminDashboardService.getDashboardOverview();
      this.logger.log('Dashboard overview data retrieved successfully');
      return {
        success: true,
        data: overview,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get dashboard overview', error);
      throw new HttpException(
        'Failed to retrieve dashboard overview',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('users/activity')
  @ApiOperation({ summary: '获取用户活动统计' })
  @ApiQuery({ name: 'days', required: false, description: '统计天数', example: 30 })
  @ApiResponse({ status: 200, description: '成功获取用户活动统计' })
  async getUserActivityStats(@Query('days') days?: string) {
    try {
      const daysNumber = days ? parseInt(days, 10) : 30;
      if (isNaN(daysNumber) || daysNumber < 1 || daysNumber > 365) {
        throw new HttpException(
          'Days parameter must be a number between 1 and 365',
          HttpStatus.BAD_REQUEST,
        );
      }

      const activityStats = await this.adminDashboardService.getUserActivityStats(daysNumber);
      this.logger.log(`User activity stats retrieved for ${daysNumber} days`);
      return {
        success: true,
        data: activityStats,
        period: {
          days: daysNumber,
          from: new Date(Date.now() - daysNumber * 24 * 60 * 60 * 1000).toISOString(),
          to: new Date().toISOString(),
        },
      };
    } catch (error) {
      this.logger.error('Failed to get user activity stats', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to retrieve user activity statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('content/stats')
  @ApiOperation({ summary: '获取内容统计数据' })
  @ApiResponse({ status: 200, description: '成功获取内容统计' })
  async getContentStats() {
    try {
      const contentStats = await this.adminDashboardService.getContentStats();
      this.logger.log('Content statistics retrieved successfully');
      return {
        success: true,
        data: contentStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get content stats', error);
      throw new HttpException(
        'Failed to retrieve content statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('system/health')
  @ApiOperation({ summary: '获取系统健康状态' })
  @ApiResponse({ status: 200, description: '成功获取系统健康状态' })
  async getSystemHealth() {
    try {
      const systemHealth = await this.adminDashboardService.getSystemHealth();
      this.logger.log('System health status retrieved successfully');
      return {
        success: true,
        data: systemHealth,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get system health', error);
      throw new HttpException(
        'Failed to retrieve system health status',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('security/metrics')
  @ApiOperation({ summary: '获取安全指标' })
  @ApiResponse({ status: 200, description: '成功获取安全指标' })
  async getSecurityMetrics() {
    try {
      const securityMetrics = await this.adminDashboardService.getSecurityMetrics();
      this.logger.log('Security metrics retrieved successfully');
      return {
        success: true,
        data: securityMetrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get security metrics', error);
      throw new HttpException(
        'Failed to retrieve security metrics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('payments/analytics')
  @ApiOperation({ summary: '获取支付分析数据' })
  @ApiQuery({
    name: 'period',
    required: false,
    description: '统计周期',
    enum: ['day', 'week', 'month', 'year'],
  })
  @ApiResponse({ status: 200, description: '成功获取支付分析数据' })
  async getPaymentAnalytics(@Query('period') period?: 'day' | 'week' | 'month' | 'year') {
    try {
      const validPeriods = ['day', 'week', 'month', 'year'];
      const selectedPeriod = period && validPeriods.includes(period) ? period : 'month';

      const [revenueStats, subscriptionAnalysis, successRateStats, customerLTV, trendAnalysis] =
        await Promise.all([
          this.paymentAnalyticsService.getRevenueStats(),
          this.paymentAnalyticsService.getSubscriptionAnalytics(),
          this.paymentAnalyticsService.getPaymentSuccessRateStats(),
          this.paymentAnalyticsService.getCustomerLifetimeValue(),
          this.paymentAnalyticsService.getPaymentTrends(30),
        ]);

      const analyticsData = {
        revenue: revenueStats,
        subscriptions: subscriptionAnalysis,
        successRate: successRateStats,
        customerLTV,
        trends: trendAnalysis,
        period: selectedPeriod,
      };

      this.logger.log(`Payment analytics retrieved for period: ${selectedPeriod}`);
      return {
        success: true,
        data: analyticsData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get payment analytics', error);
      throw new HttpException(
        'Failed to retrieve payment analytics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('reports/comprehensive')
  @ApiOperation({ summary: '获取综合报告' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期 (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期 (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: '成功获取综合报告' })
  async getComprehensiveReport(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    try {
      // 验证日期格式
      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new HttpException(
            'Invalid start date format. Use YYYY-MM-DD',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      if (endDate) {
        end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new HttpException(
            'Invalid end date format. Use YYYY-MM-DD',
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      // 如果没有提供日期，默认为最近30天
      if (!start) {
        start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }
      if (!end) {
        end = new Date();
      }

      // 验证日期范围
      if (start >= end) {
        throw new HttpException('Start date must be before end date', HttpStatus.BAD_REQUEST);
      }

      const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff > 365) {
        throw new HttpException('Date range cannot exceed 365 days', HttpStatus.BAD_REQUEST);
      }

      // 获取所有数据
      const [
        overview,
        userActivity,
        contentStats,
        systemHealth,
        securityMetrics,
        paymentAnalytics,
      ] = await Promise.all([
        this.adminDashboardService.getDashboardOverview(),
        this.adminDashboardService.getUserActivityStats(daysDiff),
        this.adminDashboardService.getContentStats(),
        this.adminDashboardService.getSystemHealth(),
        this.adminDashboardService.getSecurityMetrics(),
        this.paymentAnalyticsService.generateComprehensiveReport(),
      ]);

      const comprehensiveReport = {
        overview,
        userActivity,
        contentStats,
        systemHealth,
        securityMetrics,
        paymentAnalytics,
        reportPeriod: {
          startDate: start.toISOString(),
          endDate: end.toISOString(),
          days: daysDiff,
        },
        generatedAt: new Date().toISOString(),
      };

      this.logger.log(`Comprehensive report generated for ${daysDiff} days`);
      return {
        success: true,
        data: comprehensiveReport,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to generate comprehensive report', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Failed to generate comprehensive report',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('alerts')
  @ApiOperation({ summary: '获取系统警报' })
  @ApiQuery({
    name: 'severity',
    required: false,
    description: '警报严重程度',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @ApiQuery({ name: 'acknowledged', required: false, description: '是否已确认', type: 'boolean' })
  @ApiResponse({ status: 200, description: '成功获取系统警报' })
  async getSystemAlerts(
    @Query('severity') severity?: 'low' | 'medium' | 'high' | 'critical',
    @Query('acknowledged') acknowledged?: string,
  ) {
    try {
      const systemHealth = await this.adminDashboardService.getSystemHealth();
      let alerts = systemHealth.alerts;

      // 按严重程度过滤
      if (severity) {
        alerts = alerts.filter(alert => alert.severity === severity);
      }

      // 按确认状态过滤
      if (acknowledged !== undefined) {
        const isAcknowledged = acknowledged === 'true';
        alerts = alerts.filter(alert => alert.acknowledged === isAcknowledged);
      }

      // 按时间排序（最新的在前）
      alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      this.logger.log(`Retrieved ${alerts.length} system alerts`);
      return {
        success: true,
        data: {
          alerts,
          summary: {
            total: alerts.length,
            critical: alerts.filter(a => a.severity === 'critical').length,
            high: alerts.filter(a => a.severity === 'high').length,
            medium: alerts.filter(a => a.severity === 'medium').length,
            low: alerts.filter(a => a.severity === 'low').length,
            unacknowledged: alerts.filter(a => !a.acknowledged).length,
          },
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get system alerts', error);
      throw new HttpException('Failed to retrieve system alerts', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('alerts/:alertId/acknowledge')
  @ApiOperation({ summary: '确认系统警报' })
  @ApiResponse({ status: 200, description: '成功确认警报' })
  async acknowledgeAlert(@Param('alertId') alertId: string) {
    try {
      // 这里应该实现警报确认逻辑
      // 由于当前警报是动态生成的，我们发送一个事件来处理
      this.eventEmitter.emit('alert.acknowledged', {
        alertId,
        acknowledgedAt: new Date(),
        acknowledgedBy: 'admin', // 应该从JWT token获取用户信息
      });

      this.logger.log(`Alert ${alertId} acknowledged`);
      return {
        success: true,
        message: 'Alert acknowledged successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(`Failed to acknowledge alert ${alertId}`, error);
      throw new HttpException('Failed to acknowledge alert', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('export/data')
  @ApiOperation({ summary: '导出仪表板数据' })
  @ApiQuery({ name: 'format', required: false, description: '导出格式', enum: ['json', 'csv'] })
  @ApiQuery({
    name: 'sections',
    required: false,
    description: '要导出的部分（逗号分隔）',
    example: 'overview,users,content',
  })
  @ApiResponse({ status: 200, description: '成功导出数据' })
  async exportDashboardData(
    @Query('format') format?: 'json' | 'csv',
    @Query('sections') sections?: string,
  ) {
    try {
      const exportFormat = format || 'json';
      const sectionsToExport = sections
        ? sections.split(',').map(s => s.trim())
        : ['overview', 'users', 'content', 'payments'];

      const exportData: any = {
        exportedAt: new Date().toISOString(),
        format: exportFormat,
        sections: sectionsToExport,
      };

      // 根据请求的部分获取数据
      if (sectionsToExport.includes('overview')) {
        exportData.overview = await this.adminDashboardService.getDashboardOverview();
      }

      if (sectionsToExport.includes('users')) {
        exportData.users = await this.adminDashboardService.getUserActivityStats(30);
      }

      if (sectionsToExport.includes('content')) {
        exportData.content = await this.adminDashboardService.getContentStats();
      }

      if (sectionsToExport.includes('payments')) {
        exportData.payments = await this.paymentAnalyticsService.generateComprehensiveReport();
      }

      if (sectionsToExport.includes('system')) {
        exportData.system = await this.adminDashboardService.getSystemHealth();
      }

      if (sectionsToExport.includes('security')) {
        exportData.security = await this.adminDashboardService.getSecurityMetrics();
      }

      // 记录导出事件
      this.eventEmitter.emit('dashboard.data.exported', {
        format: exportFormat,
        sections: sectionsToExport,
        exportedBy: 'admin', // 应该从JWT token获取
        timestamp: new Date(),
      });

      this.logger.log(
        `Dashboard data exported in ${exportFormat} format with sections: ${sectionsToExport.join(', ')}`,
      );

      if (exportFormat === 'csv') {
        // 对于CSV格式，需要将数据转换为CSV格式
        // 这里简化处理，实际应该实现完整的CSV转换
        return {
          success: true,
          data: exportData,
          message: 'CSV export functionality needs to be implemented',
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: true,
        data: exportData,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to export dashboard data', error);
      throw new HttpException('Failed to export dashboard data', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('real-time/stats')
  @ApiOperation({ summary: '获取实时统计数据' })
  @ApiResponse({ status: 200, description: '成功获取实时统计' })
  async getRealTimeStats() {
    try {
      // 获取实时数据（缓存时间较短）
      const [systemHealth, recentActivity] = await Promise.all([
        this.adminDashboardService.getSystemHealth(),
        this.getRealTimeActivity(),
      ]);

      const realTimeStats = {
        system: {
          status: systemHealth.status,
          activeConnections: systemHealth.performance.networkIO.bytesIn, // 简化
          memoryUsage: systemHealth.performance.memoryUsage,
          cpuUsage: systemHealth.performance.cpuUsage,
        },
        activity: recentActivity,
        alerts: systemHealth.alerts.filter(alert => !alert.acknowledged).length,
        timestamp: new Date().toISOString(),
      };

      return {
        success: true,
        data: realTimeStats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to get real-time stats', error);
      throw new HttpException(
        'Failed to retrieve real-time statistics',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // 私有辅助方法
  private async getRealTimeActivity() {
    // 获取最近的活动数据
    // const now = new Date();
    // const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    // 这里应该实现实际的实时活动统计
    return {
      activeUsers: 0, // 当前在线用户数
      recentLogins: 0, // 最近1小时登录数
      recentUploads: 0, // 最近1小时上传数
      recentDownloads: 0, // 最近1小时下载数
      recentErrors: 0, // 最近1小时错误数
    };
  }
}
