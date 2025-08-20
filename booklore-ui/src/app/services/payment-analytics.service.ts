import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface RevenueStats {
  totalRevenue: number;
  monthlyRevenue: number;
  yearlyRevenue: number;
  currency: string;
  growth: {
    monthly: number;
    yearly: number;
  };
  revenueByMonth: {
    month: string;
    revenue: number;
  }[];
}

export interface SubscriptionAnalytics {
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

export interface PaymentTrends {
  successRate: number;
  failureRate: number;
  averageTransactionValue: number;
  totalTransactions: number;
  paymentsByMethod: {
    method: string;
    count: number;
    successRate: number;
  }[];
  trendsOverTime: {
    date: string;
    successCount: number;
    failureCount: number;
    totalAmount: number;
  }[];
}

export interface ComprehensiveReport {
  revenue: RevenueStats;
  subscriptions: SubscriptionAnalytics;
  payments: PaymentTrends;
  topCustomers: {
    customerId: string;
    customerEmail: string;
    totalSpent: number;
    subscriptionCount: number;
  }[];
  recentActivity: {
    type: string;
    description: string;
    amount?: number;
    date: Date;
  }[];
}

export interface DashboardSummary {
  totalRevenue: number;
  monthlyRevenue: number;
  activeSubscriptions: number;
  churnRate: number;
  paymentSuccessRate: number;
  totalCustomers: number;
  recentPayments: {
    id: string;
    amount: number;
    currency: string;
    customerEmail: string;
    date: Date;
    status: string;
  }[];
  alerts: {
    type: 'warning' | 'error' | 'info';
    message: string;
    date: Date;
  }[];
}

@Injectable({
  providedIn: 'root'
})
export class PaymentAnalyticsService {
  private readonly API_URL = `${environment.API_CONFIG.BASE_URL}/api/v1/payment-analytics`;

  constructor(private http: HttpClient) {}

  // 获取收入统计
  getRevenueStats(period?: string): Observable<{ success: boolean; data: RevenueStats }> {
    const params: Record<string, string> = {};
    if (period) {
      params['period'] = period;
    }
    return this.http.get<{ success: boolean; data: RevenueStats }>(`${this.API_URL}/revenue`, { params });
  }

  // 获取订阅分析
  getSubscriptionAnalytics(period?: string): Observable<{ success: boolean; data: SubscriptionAnalytics }> {
    const params: Record<string, string> = {};
    if (period) {
      params['period'] = period;
    }
    return this.http.get<{ success: boolean; data: SubscriptionAnalytics }>(`${this.API_URL}/subscriptions`, { params });
  }

  // 获取支付趋势分析
  getPaymentTrends(period?: string): Observable<{ success: boolean; data: PaymentTrends }> {
    const params: Record<string, string> = {};
    if (period) {
      params['period'] = period;
    }
    return this.http.get<{ success: boolean; data: PaymentTrends }>(`${this.API_URL}/payment-trends`, { params });
  }

  // 获取综合分析报告
  getComprehensiveReport(period?: string): Observable<{ success: boolean; data: ComprehensiveReport }> {
    const params: Record<string, string> = {};
    if (period) {
      params['period'] = period;
    }
    return this.http.get<{ success: boolean; data: ComprehensiveReport }>(`${this.API_URL}/comprehensive-report`, { params });
  }

  // 获取发票详情
  getInvoiceDetails(invoiceId: string): Observable<{
    success: boolean;
    data: {
      id: string;
      number: string;
      status: string;
      amount: number;
      currency: string;
      description: string;
      createdAt: string;
      dueDate?: string;
      paidAt?: string;
      hostedUrl?: string;
      pdfUrl?: string;
      customer: {
        name: string;
        email: string;
        address?: {
          line1?: string;
          line2?: string;
          city?: string;
          state?: string;
          postalCode?: string;
          country?: string;
        };
      };
      lineItems: {
        description: string;
        quantity: number;
        unitAmount: number;
        amount: number;
      }[];
      subtotal: number;
      tax?: number;
      total: number;
    };
  }> {
    return this.http.get<{
      success: boolean;
      data: {
        id: string;
        number: string;
        status: string;
        amount: number;
        currency: string;
        description: string;
        createdAt: string;
        dueDate?: string;
        paidAt?: string;
        hostedUrl?: string;
        pdfUrl?: string;
        customer: {
          name: string;
          email: string;
          address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postalCode?: string;
            country?: string;
          };
        };
        lineItems: {
          description: string;
          quantity: number;
          unitAmount: number;
          amount: number;
        }[];
        subtotal: number;
        tax?: number;
        total: number;
      };
    }>(`${this.API_URL}/invoices/${invoiceId}`);
  }

  // 获取管理员仪表板摘要
  getDashboardSummary(): Observable<{ success: boolean; data: DashboardSummary }> {
    return this.http.get<{ success: boolean; data: DashboardSummary }>(`${this.API_URL}/dashboard-summary`);
  }

  // 导出分析报告
  exportReport(type: 'revenue' | 'subscriptions' | 'payments' | 'comprehensive', format: 'csv' | 'pdf', period?: string): Observable<Blob> {
    const params: Record<string, string> = { type, format };
    if (period) {
      params['period'] = period;
    }
    
    return this.http.get(`${this.API_URL}/export`, {
      params,
      responseType: 'blob'
    });
  }
}