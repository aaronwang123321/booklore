import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from './auth/decorators/public.decorator';
import { MonitoringService } from './shared/monitoring/monitoring.service';
import { RedisService } from './shared/redis/redis.service';
import { PrismaService } from './shared/database/prisma.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(
    private readonly monitoringService: MonitoringService,
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaService,
  ) {}

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  @Header('Cache-Control', 'no-cache')
  async getHealth() {
    const startTime = process.hrtime.bigint();

    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };

    const endTime = process.hrtime.bigint();
    const responseTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds

    return {
      ...health,
      responseTime: `${responseTime.toFixed(2)}ms`,
    };
  }

  @Public()
  @Get('health/detailed')
  @ApiOperation({ summary: 'Detailed health check with metrics' })
  @ApiResponse({ status: 200, description: 'Detailed service health information' })
  async getDetailedHealth() {
    const startTime = process.hrtime.bigint();

    try {
      // Check database connectivity
      const dbStart = process.hrtime.bigint();
      await this.prismaService.$queryRaw`SELECT 1`;
      const dbTime = Number(process.hrtime.bigint() - dbStart) / 1000000;

      // Check Redis connectivity
      const redisStart = process.hrtime.bigint();
      const redisHealthy = this.redisService.isHealthy();
      let redisTime = 0;

      if (redisHealthy) {
        await this.redisService.get('health-check');
        redisTime = Number(process.hrtime.bigint() - redisStart) / 1000000;
      }

      // Get application metrics
      const appMetrics = await this.monitoringService.getHealthMetrics();

      // Get Redis stats if available
      const redisStats = redisHealthy ? await this.redisService.getStats() : null;

      const endTime = process.hrtime.bigint();
      const totalResponseTime = Number(endTime - startTime) / 1000000;

      return {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',

        // Performance metrics
        performance: {
          responseTime: `${totalResponseTime.toFixed(2)}ms`,
          uptime: process.uptime(),
          ...appMetrics,
        },

        // Service dependencies
        dependencies: {
          database: {
            status: 'connected',
            responseTime: `${dbTime.toFixed(2)}ms`,
          },
          redis: {
            status: redisHealthy ? 'connected' : 'disconnected',
            responseTime: redisHealthy ? `${redisTime.toFixed(2)}ms` : 'N/A',
            stats: redisStats,
          },
        },

        // System resources
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          pid: process.pid,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error.message,
      };
    }
  }

  @Public()
  @Get('metrics')
  @ApiOperation({ summary: 'Prometheus metrics endpoint' })
  @ApiResponse({ status: 200, description: 'Prometheus metrics in text format' })
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  async getMetrics() {
    return await this.monitoringService.getMetrics();
  }

  @Public()
  @Get('performance')
  @ApiOperation({ summary: 'Performance analysis report' })
  @ApiResponse({ status: 200, description: 'Detailed performance analysis' })
  async getPerformanceReport() {
    return await this.monitoringService.getPerformanceReport();
  }
}
