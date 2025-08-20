import { Controller, Get, Query, UseGuards, HttpStatus, HttpException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { SystemMonitorService } from '../services/system-monitor.service';
import { Role } from '@prisma/client';

@Controller('admin/system-monitor')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class SystemMonitorController {
  constructor(private readonly systemMonitorService: SystemMonitorService) {}

  @Get('metrics/current')
  async getCurrentMetrics() {
    try {
      const metrics = await this.systemMonitorService.getCurrentMetrics();
      return {
        success: true,
        data: metrics,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取当前系统指标失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('metrics/history')
  async getMetricsHistory(
    @Query('hours') hours: string = '24',
    @Query('interval') interval: string = '1h',
  ) {
    try {
      const hoursNum = parseInt(hours, 10);
      if (isNaN(hoursNum) || hoursNum <= 0 || hoursNum > 168) {
        throw new HttpException(
          {
            success: false,
            message: '时间范围必须在1-168小时之间',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const validIntervals = ['5m', '15m', '30m', '1h', '6h', '12h', '24h'];
      if (!validIntervals.includes(interval)) {
        throw new HttpException(
          {
            success: false,
            message: '无效的时间间隔',
            validIntervals,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const history = await this.systemMonitorService.getMetricsHistory(hoursNum);
      return {
        success: true,
        data: history,
        meta: {
          hours: hoursNum,
          interval,
          dataPoints: history.length,
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: '获取历史指标失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('alerts')
  async getActiveAlerts(@Query('severity') severity?: string, @Query('type') type?: string) {
    try {
      const alerts = await this.systemMonitorService.getActiveAlerts();

      let filteredAlerts = alerts;

      if (severity) {
        const validSeverities = ['low', 'medium', 'high', 'critical'];
        if (!validSeverities.includes(severity)) {
          throw new HttpException(
            {
              success: false,
              message: '无效的严重程度',
              validSeverities,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        filteredAlerts = filteredAlerts.filter(alert => alert.severity === severity);
      }

      if (type) {
        const validTypes = ['cpu', 'memory', 'disk', 'network', 'process'];
        if (!validTypes.includes(type)) {
          throw new HttpException(
            {
              success: false,
              message: '无效的警报类型',
              validTypes,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
        filteredAlerts = filteredAlerts.filter(alert => alert.type === type);
      }

      return {
        success: true,
        data: filteredAlerts,
        meta: {
          total: alerts.length,
          filtered: filteredAlerts.length,
          filters: { severity, type },
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: '获取活跃警报失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('health')
  async getSystemHealth() {
    try {
      const health = await this.systemMonitorService.getSystemHealth();
      return {
        success: true,
        data: health,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取系统健康状态失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('performance/summary')
  async getPerformanceSummary(@Query('period') period: string = '24h') {
    try {
      const validPeriods = ['1h', '6h', '12h', '24h', '7d', '30d'];
      if (!validPeriods.includes(period)) {
        throw new HttpException(
          {
            success: false,
            message: '无效的时间周期',
            validPeriods,
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const [currentMetrics, health] = await Promise.all([
        this.systemMonitorService.getCurrentMetrics(),
        this.systemMonitorService.getSystemHealth(),
      ]);

      // 计算性能摘要
      const summary = {
        overall: health.status,
        cpu: {
          current: currentMetrics.cpu.usage,
          status: health.status,
          trend: 'stable', // 这里可以基于历史数据计算趋势
        },
        memory: {
          current: currentMetrics.memory.usage,
          available: currentMetrics.memory.free,
          status: health.status,
          trend: 'stable',
        },
        disk: {
          usage: currentMetrics.disk.usage,
          available: currentMetrics.disk.free,
          status: health.status,
          trend: 'stable',
        },
        network: {
          bytesIn: currentMetrics.network.bytesIn,
          bytesOut: currentMetrics.network.bytesOut,
          status: health.status,
        },
        uptime: currentMetrics.process.uptime,
        lastUpdated: new Date().toISOString(),
      };

      return {
        success: true,
        data: summary,
        meta: {
          period,
          generatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        {
          success: false,
          message: '获取性能摘要失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Get('thresholds')
  async getPerformanceThresholds() {
    try {
      // 返回当前的性能阈值配置
      const thresholds = {
        cpu: {
          warning: 70,
          critical: 90,
          unit: 'percentage',
        },
        memory: {
          warning: 80,
          critical: 95,
          unit: 'percentage',
        },
        disk: {
          warning: 85,
          critical: 95,
          unit: 'percentage',
        },
        network: {
          warning: 100 * 1024 * 1024, // 100MB/s
          critical: 500 * 1024 * 1024, // 500MB/s
          unit: 'bytes_per_second',
        },
        responseTime: {
          warning: 1000,
          critical: 5000,
          unit: 'milliseconds',
        },
      };

      return {
        success: true,
        data: thresholds,
        description: '系统性能监控阈值配置',
      };
    } catch (error) {
      throw new HttpException(
        {
          success: false,
          message: '获取性能阈值失败',
          error: error.message,
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
