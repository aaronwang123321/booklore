import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../shared/database/prisma.service';
import * as os from 'os';
import * as process from 'process';

export interface SystemMetrics {
  timestamp: Date;
  cpu: {
    usage: number;
    loadAverage: number[];
    cores: number;
  };
  memory: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
  process: {
    pid: number;
    uptime: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
  };
}

export interface PerformanceAlert {
  id: string;
  type: 'cpu' | 'memory' | 'disk' | 'network' | 'database';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  value: number;
  threshold: number;
  timestamp: Date;
  resolved: boolean;
}

export interface DatabaseMetrics {
  connections: {
    active: number;
    idle: number;
    total: number;
  };
  queries: {
    total: number;
    slow: number;
    failed: number;
    averageTime: number;
  };
  size: {
    total: number;
    tables: Array<{
      name: string;
      size: number;
      rows: number;
    }>;
  };
}

@Injectable()
export class SystemMonitorService {
  private readonly logger = new Logger(SystemMonitorService.name);
  private metricsHistory: SystemMetrics[] = [];
  private activeAlerts: Map<string, PerformanceAlert> = new Map();
  private readonly MAX_HISTORY_SIZE = 1440; // 24小时的分钟数
  private previousCpuUsage: NodeJS.CpuUsage | null = null;
  private networkStats = {
    bytesIn: 0,
    bytesOut: 0,
    packetsIn: 0,
    packetsOut: 0,
  };

  // 性能阈值配置
  private readonly thresholds = {
    cpu: {
      warning: 70,
      critical: 90,
    },
    memory: {
      warning: 80,
      critical: 95,
    },
    disk: {
      warning: 85,
      critical: 95,
    },
    database: {
      connections: {
        warning: 80,
        critical: 95,
      },
      slowQueries: {
        warning: 100,
        critical: 500,
      },
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {
    this.initializeMonitoring();
  }

  private async initializeMonitoring() {
    this.logger.log('Initializing system monitoring...');

    // 初始化CPU使用率基准
    this.previousCpuUsage = process.cpuUsage();

    // 开始收集指标
    await this.collectMetrics();

    this.logger.log('System monitoring initialized successfully');
  }

  // 每分钟收集系统指标
  @Cron(CronExpression.EVERY_MINUTE)
  async collectMetrics(): Promise<void> {
    try {
      const metrics = await this.gatherSystemMetrics();

      // 添加到历史记录
      this.metricsHistory.push(metrics);

      // 保持历史记录大小
      if (this.metricsHistory.length > this.MAX_HISTORY_SIZE) {
        this.metricsHistory.shift();
      }

      // 检查性能阈值
      await this.checkPerformanceThresholds(metrics);

      // 发送实时更新事件
      this.eventEmitter.emit('system.metrics.updated', metrics);
    } catch (error) {
      this.logger.error('Failed to collect system metrics', error);
    }
  }

  // 收集系统指标
  private async gatherSystemMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date();

    // CPU指标
    const cpuMetrics = await this.getCpuMetrics();

    // 内存指标
    const memoryMetrics = this.getMemoryMetrics();

    // 磁盘指标
    const diskMetrics = await this.getDiskMetrics();

    // 网络指标
    const networkMetrics = this.getNetworkMetrics();

    // 进程指标
    const processMetrics = this.getProcessMetrics();

    return {
      timestamp,
      cpu: cpuMetrics,
      memory: memoryMetrics,
      disk: diskMetrics,
      network: networkMetrics,
      process: processMetrics,
    };
  }

  private async getCpuMetrics() {
    const cpus = os.cpus();
    const loadAverage = os.loadavg();

    // 计算CPU使用率
    let cpuUsage = 0;
    if (this.previousCpuUsage) {
      const currentUsage = process.cpuUsage(this.previousCpuUsage);
      const totalUsage = currentUsage.user + currentUsage.system;
      cpuUsage = (totalUsage / 1000000) * 100; // 转换为百分比
    }
    this.previousCpuUsage = process.cpuUsage();

    return {
      usage: Math.min(cpuUsage, 100),
      loadAverage,
      cores: cpus.length,
    };
  }

  private getMemoryMetrics() {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;
    const usage = (usedMemory / totalMemory) * 100;

    return {
      total: totalMemory,
      used: usedMemory,
      free: freeMemory,
      usage,
    };
  }

  private async getDiskMetrics() {
    try {
      // 获取当前工作目录的磁盘使用情况
      // const stats = await fs.stat(process.cwd());

      // 在实际环境中，应该使用更准确的磁盘空间检查方法
      // 这里提供一个简化的实现
      const total = 100 * 1024 * 1024 * 1024; // 假设100GB
      const used = 50 * 1024 * 1024 * 1024; // 假设使用50GB
      const free = total - used;
      const usage = (used / total) * 100;

      return {
        total,
        used,
        free,
        usage,
      };
    } catch (error) {
      this.logger.warn('Failed to get disk metrics', error);
      return {
        total: 0,
        used: 0,
        free: 0,
        usage: 0,
      };
    }
  }

  private getNetworkMetrics() {
    // 在实际环境中，应该从系统获取真实的网络统计
    // 这里提供一个简化的实现
    return {
      bytesIn: this.networkStats.bytesIn,
      bytesOut: this.networkStats.bytesOut,
      packetsIn: this.networkStats.packetsIn,
      packetsOut: this.networkStats.packetsOut,
    };
  }

  private getProcessMetrics() {
    return {
      pid: process.pid,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
    };
  }

  // 检查性能阈值
  private async checkPerformanceThresholds(metrics: SystemMetrics): Promise<void> {
    const alerts: PerformanceAlert[] = [];

    // 检查CPU使用率
    if (metrics.cpu.usage > this.thresholds.cpu.critical) {
      alerts.push(
        this.createAlert(
          'cpu',
          'critical',
          `CPU usage is critically high: ${metrics.cpu.usage.toFixed(1)}%`,
          metrics.cpu.usage,
          this.thresholds.cpu.critical,
        ),
      );
    } else if (metrics.cpu.usage > this.thresholds.cpu.warning) {
      alerts.push(
        this.createAlert(
          'cpu',
          'high',
          `CPU usage is high: ${metrics.cpu.usage.toFixed(1)}%`,
          metrics.cpu.usage,
          this.thresholds.cpu.warning,
        ),
      );
    }

    // 检查内存使用率
    if (metrics.memory.usage > this.thresholds.memory.critical) {
      alerts.push(
        this.createAlert(
          'memory',
          'critical',
          `Memory usage is critically high: ${metrics.memory.usage.toFixed(1)}%`,
          metrics.memory.usage,
          this.thresholds.memory.critical,
        ),
      );
    } else if (metrics.memory.usage > this.thresholds.memory.warning) {
      alerts.push(
        this.createAlert(
          'memory',
          'high',
          `Memory usage is high: ${metrics.memory.usage.toFixed(1)}%`,
          metrics.memory.usage,
          this.thresholds.memory.warning,
        ),
      );
    }

    // 检查磁盘使用率
    if (metrics.disk.usage > this.thresholds.disk.critical) {
      alerts.push(
        this.createAlert(
          'disk',
          'critical',
          `Disk usage is critically high: ${metrics.disk.usage.toFixed(1)}%`,
          metrics.disk.usage,
          this.thresholds.disk.critical,
        ),
      );
    } else if (metrics.disk.usage > this.thresholds.disk.warning) {
      alerts.push(
        this.createAlert(
          'disk',
          'high',
          `Disk usage is high: ${metrics.disk.usage.toFixed(1)}%`,
          metrics.disk.usage,
          this.thresholds.disk.warning,
        ),
      );
    }

    // 检查数据库性能
    const dbMetrics = await this.getDatabaseMetrics();
    await this.checkDatabaseThresholds(dbMetrics, alerts);

    // 处理新警报
    for (const alert of alerts) {
      await this.handleAlert(alert);
    }

    // 检查已解决的警报
    await this.checkResolvedAlerts(metrics);
  }

  private createAlert(
    type: PerformanceAlert['type'],
    severity: PerformanceAlert['severity'],
    message: string,
    value: number,
    threshold: number,
  ): PerformanceAlert {
    return {
      id: `${type}-${Date.now()}`,
      type,
      severity,
      message,
      value,
      threshold,
      timestamp: new Date(),
      resolved: false,
    };
  }

  private async handleAlert(alert: PerformanceAlert): Promise<void> {
    // 检查是否已存在相同类型的活跃警报
    const existingAlert = Array.from(this.activeAlerts.values()).find(
      a => a.type === alert.type && !a.resolved,
    );

    if (!existingAlert) {
      this.activeAlerts.set(alert.id, alert);

      // 发送警报事件
      this.eventEmitter.emit('system.alert.created', alert);

      this.logger.warn(`Performance alert: ${alert.message}`);

      // 如果是严重警报，发送紧急通知
      if (alert.severity === 'critical') {
        this.eventEmitter.emit('system.alert.critical', alert);
      }
    }
  }

  private async checkResolvedAlerts(metrics: SystemMetrics): Promise<void> {
    for (const [, alert] of this.activeAlerts) {
      if (alert.resolved) continue;

      let isResolved = false;

      switch (alert.type) {
        case 'cpu':
          isResolved = metrics.cpu.usage < alert.threshold * 0.9; // 10%的缓冲
          break;
        case 'memory':
          isResolved = metrics.memory.usage < alert.threshold * 0.9;
          break;
        case 'disk':
          isResolved = metrics.disk.usage < alert.threshold * 0.9;
          break;
      }

      if (isResolved) {
        alert.resolved = true;
        this.eventEmitter.emit('system.alert.resolved', alert);
        this.logger.log(`Performance alert resolved: ${alert.message}`);
      }
    }
  }

  // 获取数据库指标
  async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    try {
      // 获取数据库连接信息（简化实现）
      const connections = {
        active: 5, // 需要从连接池获取
        idle: 10, // 需要从连接池获取
        total: 15,
      };

      // 获取查询统计（需要实现查询日志）
      const queries = {
        total: 0,
        slow: 0,
        failed: 0,
        averageTime: 0,
      };

      // 获取数据库大小信息
      const tables = await this.getTableSizes();
      const totalSize = tables.reduce((sum, table) => sum + table.size, 0);

      return {
        connections,
        queries,
        size: {
          total: totalSize,
          tables,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get database metrics', error);
      return {
        connections: { active: 0, idle: 0, total: 0 },
        queries: { total: 0, slow: 0, failed: 0, averageTime: 0 },
        size: { total: 0, tables: [] },
      };
    }
  }

  private async getTableSizes() {
    try {
      // 获取主要表的大小信息
      const tableNames = ['User', 'Book', 'Library', 'Subscription', 'Payment'];
      const tables = [];

      for (const tableName of tableNames) {
        try {
          // 获取表的行数
          const count = await (this.prisma as any)[tableName.toLowerCase()].count();

          tables.push({
            name: tableName,
            size: count * 1024, // 简化的大小估算
            rows: count,
          });
        } catch (error) {
          // 忽略不存在的表
        }
      }

      return tables;
    } catch (error) {
      this.logger.error('Failed to get table sizes', error);
      return [];
    }
  }

  private async checkDatabaseThresholds(
    dbMetrics: DatabaseMetrics,
    alerts: PerformanceAlert[],
  ): Promise<void> {
    // 检查数据库连接数
    const connectionUsage = (dbMetrics.connections.active / dbMetrics.connections.total) * 100;

    if (connectionUsage > this.thresholds.database.connections.critical) {
      alerts.push(
        this.createAlert(
          'database',
          'critical',
          `Database connection usage is critically high: ${connectionUsage.toFixed(1)}%`,
          connectionUsage,
          this.thresholds.database.connections.critical,
        ),
      );
    } else if (connectionUsage > this.thresholds.database.connections.warning) {
      alerts.push(
        this.createAlert(
          'database',
          'high',
          `Database connection usage is high: ${connectionUsage.toFixed(1)}%`,
          connectionUsage,
          this.thresholds.database.connections.warning,
        ),
      );
    }

    // 检查慢查询
    if (dbMetrics.queries.slow > this.thresholds.database.slowQueries.critical) {
      alerts.push(
        this.createAlert(
          'database',
          'critical',
          `Too many slow queries: ${dbMetrics.queries.slow}`,
          dbMetrics.queries.slow,
          this.thresholds.database.slowQueries.critical,
        ),
      );
    } else if (dbMetrics.queries.slow > this.thresholds.database.slowQueries.warning) {
      alerts.push(
        this.createAlert(
          'database',
          'high',
          `High number of slow queries: ${dbMetrics.queries.slow}`,
          dbMetrics.queries.slow,
          this.thresholds.database.slowQueries.warning,
        ),
      );
    }
  }

  // 公共API方法
  getCurrentMetrics(): SystemMetrics | null {
    return this.metricsHistory.length > 0
      ? this.metricsHistory[this.metricsHistory.length - 1]
      : null;
  }

  getMetricsHistory(hours: number = 1): SystemMetrics[] {
    const pointsNeeded = hours * 60; // 每小时60个数据点
    return this.metricsHistory.slice(-pointsNeeded);
  }

  getActiveAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values())
      .filter(alert => !alert.resolved)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  getAllAlerts(): PerformanceAlert[] {
    return Array.from(this.activeAlerts.values()).sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime(),
    );
  }

  async getSystemHealth(): Promise<{
    status: 'healthy' | 'warning' | 'critical';
    score: number;
    issues: string[];
  }> {
    const currentMetrics = this.getCurrentMetrics();
    if (!currentMetrics) {
      return {
        status: 'warning',
        score: 0,
        issues: ['No metrics available'],
      };
    }

    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical');
    const highAlerts = activeAlerts.filter(a => a.severity === 'high');

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    let score = 100;
    const issues: string[] = [];

    // 根据警报确定状态
    if (criticalAlerts.length > 0) {
      status = 'critical';
      score -= criticalAlerts.length * 30;
      issues.push(...criticalAlerts.map(a => a.message));
    } else if (highAlerts.length > 0) {
      status = 'warning';
      score -= highAlerts.length * 15;
      issues.push(...highAlerts.map(a => a.message));
    }

    // 根据指标调整分数
    if (currentMetrics.cpu.usage > 80) {
      score -= 10;
      if (!issues.some(i => i.includes('CPU'))) {
        issues.push(`High CPU usage: ${currentMetrics.cpu.usage.toFixed(1)}%`);
      }
    }

    if (currentMetrics.memory.usage > 80) {
      score -= 10;
      if (!issues.some(i => i.includes('Memory'))) {
        issues.push(`High memory usage: ${currentMetrics.memory.usage.toFixed(1)}%`);
      }
    }

    score = Math.max(0, score);

    return {
      status,
      score,
      issues,
    };
  }

  // 清理旧数据
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupOldData(): Promise<void> {
    try {
      // 清理已解决的旧警报
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

      for (const [alertId, alert] of this.activeAlerts) {
        if (alert.resolved && alert.timestamp < oneWeekAgo) {
          this.activeAlerts.delete(alertId);
        }
      }

      this.logger.log('Cleaned up old monitoring data');
    } catch (error) {
      this.logger.error('Failed to cleanup old monitoring data', error);
    }
  }

  // 更新网络统计（由其他服务调用）
  updateNetworkStats(
    bytesIn: number,
    bytesOut: number,
    packetsIn: number = 0,
    packetsOut: number = 0,
  ): void {
    this.networkStats.bytesIn += bytesIn;
    this.networkStats.bytesOut += bytesOut;
    this.networkStats.packetsIn += packetsIn;
    this.networkStats.packetsOut += packetsOut;
  }
}
