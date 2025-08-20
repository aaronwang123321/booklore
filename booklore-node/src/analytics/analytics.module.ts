import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SharedModule } from '../shared/shared.module';
import { AuthModule } from '../auth/auth.module';
import { PaymentAnalyticsService } from './services/payment-analytics.service';
import { PaymentAnalyticsController } from './controllers/payment-analytics.controller';
import { AdminDashboardService } from './services/admin-dashboard.service';
import { AdminDashboardController } from './controllers/admin-dashboard.controller';
import { SystemMonitorService } from './services/system-monitor.service';
import { SystemMonitorController } from './controllers/system-monitor.controller';
import { ReportGeneratorService } from './services/report-generator.service';
import { ReportGeneratorController } from './controllers/report-generator.controller';

@Module({
  imports: [SharedModule, AuthModule, ScheduleModule.forRoot()],
  controllers: [
    PaymentAnalyticsController,
    AdminDashboardController,
    SystemMonitorController,
    ReportGeneratorController,
  ],
  providers: [
    PaymentAnalyticsService,
    AdminDashboardService,
    SystemMonitorService,
    ReportGeneratorService,
  ],
  exports: [
    PaymentAnalyticsService,
    AdminDashboardService,
    SystemMonitorService,
    ReportGeneratorService,
  ],
})
export class AnalyticsModule {}
