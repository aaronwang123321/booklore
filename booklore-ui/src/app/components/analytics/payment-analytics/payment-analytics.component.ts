import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { PaymentAnalyticsService } from '../../../services/payment-analytics.service';

interface RevenueData {
  period: string;
  amount: number;
  currency: string;
  growth: number;
}

interface SubscriptionMetrics {
  totalSubscriptions: number;
  activeSubscriptions: number;
  canceledSubscriptions: number;
  churnRate: number;
  subscriptionsByPlan: {
    planName: string;
    count: number;
    revenue: number;
  }[];
  subscriptionTrends: {
    month: string;
    new: number;
    canceled: number;
    net: number;
  }[];
}

interface PaymentTrend {
  date: string;
  successCount: number;
  failureCount: number;
  totalAmount: number;
}

interface TopPlan {
  planId: string;
  planName: string;
  subscribers: number;
  revenue: number;
  percentage: number;
}

@Component({
  selector: 'app-payment-analytics',
  templateUrl: './payment-analytics.component.html',
  styleUrls: ['./payment-analytics.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PaymentAnalyticsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  // 加载状态
  loading = true;
  error: string | null = null;
  
  // 时间范围选择
  selectedPeriod = '30d';
  periodOptions = [
    { value: '7d', label: '最近7天' },
    { value: '30d', label: '最近30天' },
    { value: '90d', label: '最近90天' },
    { value: '1y', label: '最近1年' }
  ];
  
  // 数据
  revenueData: RevenueData[] = [];
  subscriptionMetrics: SubscriptionMetrics | null = null;
  paymentTrends: PaymentTrend[] = [];
  topPlans: TopPlan[] = [];
  
  // 图表配置
  chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      },
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: '日期'
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: '金额 (¥)'
        }
      }
    }
  };
  
  constructor(
    private paymentAnalyticsService: PaymentAnalyticsService
  ) {}
  
  ngOnInit(): void {
    this.loadAnalyticsData();
  }
  
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
  
  onPeriodChange(): void {
    this.loadAnalyticsData();
  }
  
  private loadAnalyticsData(): void {
    this.loading = true;
    this.error = null;
    
    // 并行加载所有数据
    Promise.all([
      this.loadRevenueData(),
      this.loadSubscriptionMetrics(),
      this.loadPaymentTrends(),
      this.loadTopPlans()
    ]).then(() => {
      this.loading = false;
    }).catch(error => {
      console.error('加载分析数据失败:', error);
      this.error = '加载数据失败，请稍后重试';
      this.loading = false;
    });
  }
  
  private async loadRevenueData(): Promise<void> {
    try {
      const response = await this.paymentAnalyticsService.getRevenueStats(this.selectedPeriod).toPromise();
      if (response?.data) {
        this.revenueData = response.data.revenueByMonth.map(item => ({
          period: item.month,
          amount: item.revenue,
          currency: response.data.currency,
          growth: response.data.growth.monthly
        }));
      }
    } catch (error) {
      console.error('加载收入数据失败:', error);
      throw error;
    }
  }
  
  private async loadSubscriptionMetrics(): Promise<void> {
    try {
      const response = await this.paymentAnalyticsService.getSubscriptionAnalytics(this.selectedPeriod).toPromise();
      this.subscriptionMetrics = response?.data || null;
    } catch (error) {
      console.error('加载订阅指标失败:', error);
      throw error;
    }
  }
  
  private async loadPaymentTrends(): Promise<void> {
    try {
      const response = await this.paymentAnalyticsService.getPaymentTrends(this.selectedPeriod).toPromise();
      if (response?.data) {
        this.paymentTrends = response.data.trendsOverTime.map(item => ({
          date: item.date,
          successCount: item.successCount,
          failureCount: item.failureCount,
          totalAmount: item.totalAmount
        }));
      }
    } catch (error) {
      console.error('加载支付趋势失败:', error);
      throw error;
    }
  }
  
  private async loadTopPlans(): Promise<void> {
    try {
      const response = await this.paymentAnalyticsService.getSubscriptionAnalytics(this.selectedPeriod).toPromise();
      if (response?.data) {
        const totalRevenue = response.data.subscriptionsByPlan.reduce((sum, plan) => sum + plan.revenue, 0);
        this.topPlans = response.data.subscriptionsByPlan.map(plan => ({
          planId: plan.planName.toLowerCase().replace(/\s+/g, '-'),
          planName: plan.planName,
          subscribers: plan.count,
          revenue: plan.revenue,
          percentage: totalRevenue > 0 ? (plan.revenue / totalRevenue) * 100 : 0
        }));
      }
    } catch (error) {
      console.error('加载热门计划失败:', error);
      throw error;
    }
  }
  
  // 格式化货币
  formatCurrency(amount: number, currency = 'CNY'): string {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2
    }).format(amount);
  }
  
  // 格式化百分比
  formatPercentage(value: number): string {
    return `${value.toFixed(1)}%`;
  }
  
  // 格式化数字
  formatNumber(value: number): string {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  }
  
  // 获取增长率样式类
  getGrowthClass(growth: number): string {
    if (growth > 0) return 'growth-positive';
    if (growth < 0) return 'growth-negative';
    return 'growth-neutral';
  }
  
  // 获取增长率图标
  getGrowthIcon(growth: number): string {
    if (growth > 0) return '↗';
    if (growth < 0) return '↘';
    return '→';
  }
  
  // 导出数据
  exportData(): void {
    const data = {
      period: this.selectedPeriod,
      exportTime: new Date().toISOString(),
      revenue: this.revenueData,
      subscriptions: this.subscriptionMetrics,
      trends: this.paymentTrends,
      topPlans: this.topPlans
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json'
    });
    
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `payment-analytics-${this.selectedPeriod}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }
  
  // 刷新数据
  refreshData(): void {
    this.loadAnalyticsData();
  }
  
  // 获取总收入
  getTotalRevenue(): number {
    return this.revenueData.reduce((sum, item) => sum + item.amount, 0);
  }
  
  // 获取收入增长率
  getRevenueGrowth(): number {
    if (this.revenueData.length === 0) return 0;
    return this.revenueData[0]?.growth || 0;
  }
  
  // 获取支付成功率
  getPaymentSuccessRate(): number {
    if (this.paymentTrends.length === 0) return 0;
    
    const totalSuccess = this.paymentTrends.reduce((sum, item) => sum + item.successCount, 0);
    const totalFailure = this.paymentTrends.reduce((sum, item) => sum + item.failureCount, 0);
    const total = totalSuccess + totalFailure;
    
    return total > 0 ? (totalSuccess / total) * 100 : 0;
  }
  
  // 获取总交易数
  getTotalTransactions(): number {
    return this.paymentTrends.reduce((sum, item) => sum + item.successCount + item.failureCount, 0);
  }
  
  // 获取图表数据
  getRevenueChartData() {
    return {
      labels: this.revenueData.map(item => item.period),
      datasets: [
        {
          label: '收入',
          data: this.revenueData.map(item => item.amount),
          borderColor: '#007bff',
          backgroundColor: 'rgba(0, 123, 255, 0.1)',
          tension: 0.4,
          fill: true
        }
      ]
    };
  }
  
  getPaymentTrendsChartData() {
    return {
      labels: this.paymentTrends.map(item => item.date),
      datasets: [
        {
          label: '成功支付',
          data: this.paymentTrends.map(item => item.successCount),
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.4
        },
        {
          label: '失败支付',
          data: this.paymentTrends.map(item => item.failureCount),
          borderColor: '#dc3545',
          backgroundColor: 'rgba(220, 53, 69, 0.1)',
          tension: 0.4
        }
      ]
    };
  }
}