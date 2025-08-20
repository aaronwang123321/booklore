import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../shared/database/prisma.service';
import { PaymentAnalyticsService } from './payment-analytics.service';
import { AdminDashboardService } from './admin-dashboard.service';
import { SystemMonitorService } from './system-monitor.service';
import * as fs from 'fs/promises';
import * as path from 'path';

interface ReportConfig {
  type: 'daily' | 'weekly' | 'monthly' | 'custom';
  format: 'json' | 'csv' | 'pdf';
  sections: string[];
  recipients?: string[];
  schedule?: string;
}

interface ReportData {
  metadata: {
    title: string;
    generatedAt: string;
    period: {
      start: string;
      end: string;
    };
    type: string;
    format: string;
  };
  summary: any;
  sections: {
    [key: string]: any;
  };
}

@Injectable()
export class ReportGeneratorService {
  private readonly logger = new Logger(ReportGeneratorService.name);
  private readonly reportsDir = path.join(process.cwd(), 'reports');

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentAnalyticsService: PaymentAnalyticsService,
    private readonly adminDashboardService: AdminDashboardService,
    private readonly systemMonitorService: SystemMonitorService,
  ) {
    this.ensureReportsDirectory();
  }

  private async ensureReportsDirectory() {
    try {
      await fs.access(this.reportsDir);
    } catch {
      await fs.mkdir(this.reportsDir, { recursive: true });
      this.logger.log('Reports directory created');
    }
  }

  async generateReport(
    config: ReportConfig,
    startDate?: Date,
    endDate?: Date,
  ): Promise<{ filePath: string; data: ReportData }> {
    try {
      const period = this.calculatePeriod(config.type, startDate, endDate);
      const reportData = await this.collectReportData(config.sections, period);

      const metadata = {
        title: this.getReportTitle(config.type),
        generatedAt: new Date().toISOString(),
        period,
        type: config.type,
        format: config.format,
      };

      const fullReportData: ReportData = {
        metadata,
        summary: await this.generateSummary(reportData),
        sections: reportData,
      };

      const filePath = await this.saveReport(fullReportData, config.format);

      this.logger.log(`Report generated: ${filePath}`);
      return { filePath, data: fullReportData };
    } catch (error) {
      this.logger.error('Failed to generate report', error.stack);
      throw error;
    }
  }

  private calculatePeriod(
    type: string,
    startDate?: Date,
    endDate?: Date,
  ): { start: string; end: string } {
    const now = new Date();
    let start: Date;
    const end: Date = endDate || now;

    if (startDate) {
      start = startDate;
    } else {
      switch (type) {
        case 'daily':
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
          break;
        default:
          start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    return {
      start: start.toISOString(),
      end: end.toISOString(),
    };
  }

  private async collectReportData(
    sections: string[],
    period: { start: string; end: string },
  ): Promise<{ [key: string]: any }> {
    const data: { [key: string]: any } = {};

    for (const section of sections) {
      try {
        switch (section) {
          case 'revenue':
            data.revenue = await this.paymentAnalyticsService.getRevenueStats(
              new Date(period.start),
              new Date(period.end),
            );
            break;
          case 'subscriptions':
            data.subscriptions = await this.paymentAnalyticsService.getSubscriptionAnalytics();
            break;
          case 'users':
            data.users = await this.adminDashboardService.getUserActivityStats();
            break;
          case 'content':
            data.content = await this.adminDashboardService.getContentStats();
            break;
          case 'system':
            data.system = await this.systemMonitorService.getCurrentMetrics();
            break;
          case 'performance':
            data.performance = await this.systemMonitorService.getSystemHealth();
            break;
          default:
            this.logger.warn(`Unknown report section: ${section}`);
        }
      } catch (error) {
        this.logger.error(`Failed to collect data for section: ${section}`, error.stack);
        data[section] = { error: error.message };
      }
    }

    return data;
  }

  private async generateSummary(data: { [key: string]: any }): Promise<any> {
    const summary: any = {
      totalSections: Object.keys(data).length,
      generatedAt: new Date().toISOString(),
    };

    // 收入摘要
    if (data.revenue) {
      summary.revenue = {
        total: data.revenue.totalRevenue || 0,
        growth: data.revenue.growthRate || 0,
      };
    }

    // 用户摘要
    if (data.users) {
      summary.users = {
        total: data.users.totalUsers || 0,
        active: data.users.activeUsers || 0,
        new: data.users.newUsers || 0,
      };
    }

    // 系统摘要
    if (data.system) {
      summary.system = {
        cpuUsage: data.system.cpu?.usage || 0,
        memoryUsage: data.system.memory?.usage || 0,
        diskUsage: data.system.disk?.usage || 0,
      };
    }

    return summary;
  }

  private async saveReport(data: ReportData, format: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `report-${timestamp}.${format}`;
    const filePath = path.join(this.reportsDir, filename);

    switch (format) {
      case 'json':
        await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        break;
      case 'csv':
        const csvContent = this.convertToCSV(data);
        await fs.writeFile(filePath, csvContent);
        break;
      case 'pdf':
        // PDF生成需要额外的库，这里先保存为JSON
        await fs.writeFile(filePath.replace('.pdf', '.json'), JSON.stringify(data, null, 2));
        this.logger.warn('PDF generation not implemented, saved as JSON instead');
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    return filePath;
  }

  private convertToCSV(data: ReportData): string {
    const lines: string[] = [];

    // 添加元数据
    lines.push('Report Metadata');
    lines.push(`Title,${data.metadata.title}`);
    lines.push(`Generated At,${data.metadata.generatedAt}`);
    lines.push(`Period Start,${data.metadata.period.start}`);
    lines.push(`Period End,${data.metadata.period.end}`);
    lines.push('');

    // 添加摘要
    if (data.summary) {
      lines.push('Summary');
      this.addObjectToCSV(data.summary, lines);
      lines.push('');
    }

    // 添加各个部分的数据
    for (const [sectionName, sectionData] of Object.entries(data.sections)) {
      lines.push(`Section: ${sectionName}`);
      this.addObjectToCSV(sectionData, lines);
      lines.push('');
    }

    return lines.join('\n');
  }

  private addObjectToCSV(obj: any, lines: string[], prefix = ''): void {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        this.addObjectToCSV(value, lines, fullKey);
      } else {
        lines.push(`${fullKey},${value}`);
      }
    }
  }

  private getReportTitle(type: string): string {
    switch (type) {
      case 'daily':
        return 'Daily Analytics Report';
      case 'weekly':
        return 'Weekly Analytics Report';
      case 'monthly':
        return 'Monthly Analytics Report';
      default:
        return 'Custom Analytics Report';
    }
  }

  async getAvailableReports(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.reportsDir);
      return files.filter(
        file => file.endsWith('.json') || file.endsWith('.csv') || file.endsWith('.pdf'),
      );
    } catch (error) {
      this.logger.error('Failed to list reports', error.stack);
      return [];
    }
  }

  async getReport(filename: string): Promise<Buffer> {
    try {
      const filePath = path.join(this.reportsDir, filename);
      return await fs.readFile(filePath);
    } catch (error) {
      this.logger.error(`Failed to read report: ${filename}`, error.stack);
      throw error;
    }
  }

  async deleteReport(filename: string): Promise<void> {
    try {
      const filePath = path.join(this.reportsDir, filename);
      await fs.unlink(filePath);
      this.logger.log(`Report deleted: ${filename}`);
    } catch (error) {
      this.logger.error(`Failed to delete report: ${filename}`, error.stack);
      throw error;
    }
  }

  // 定时生成日报
  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async generateDailyReport() {
    try {
      const config: ReportConfig = {
        type: 'daily',
        format: 'json',
        sections: ['revenue', 'users', 'system', 'performance'],
      };

      await this.generateReport(config);
      this.logger.log('Daily report generated automatically');
    } catch (error) {
      this.logger.error('Failed to generate daily report', error.stack);
    }
  }

  // 定时生成周报
  @Cron(CronExpression.EVERY_WEEK)
  async generateWeeklyReport() {
    try {
      const config: ReportConfig = {
        type: 'weekly',
        format: 'json',
        sections: ['revenue', 'subscriptions', 'users', 'content', 'system'],
      };

      await this.generateReport(config);
      this.logger.log('Weekly report generated automatically');
    } catch (error) {
      this.logger.error('Failed to generate weekly report', error.stack);
    }
  }

  // 定时清理旧报告
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupOldReports() {
    try {
      const files = await this.getAvailableReports();
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      for (const file of files) {
        const filePath = path.join(this.reportsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < thirtyDaysAgo) {
          await this.deleteReport(file);
          this.logger.log(`Old report cleaned up: ${file}`);
        }
      }
    } catch (error) {
      this.logger.error('Failed to cleanup old reports', error.stack);
    }
  }
}
