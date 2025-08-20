import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  interval: string;
  features: string[];
  stripePriceId?: string;
  isPopular?: boolean;
}

export interface SubscriptionStatus {
  isActive: boolean;
  isInTrial: boolean;
  planId?: string;
  planName?: string;
  status: 'active' | 'canceled' | 'past_due' | 'unpaid' | 'incomplete';
  nextBillingDate?: Date;
  limits: {
    maxBooks: number;
    maxLibraries: number;
    maxUsers: number;
    usedBooks: number;
    usedLibraries: number;
    usedUsers: number;
  };
}

export interface SubscriptionUsage {
  currentPlan: string;
  usageStats: {
    books: { used: number; limit: number };
    libraries: { used: number; limit: number };
    users: { used: number; limit: number };
  };
  billingCycle: {
    start: Date;
    end: Date;
    daysRemaining: number;
  };
}

export interface Invoice {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created: Date;
  pdfUrl?: string;
  hostedUrl?: string;
}

export interface PaymentHistory {
  payments: {
    id: string;
    amount: number;
    currency: string;
    date: Date;
    description: string;
    pdfUrl?: string;
    hostedUrl?: string;
  }[];
  total: number;
  currency: string;
}

export interface SubscriptionHealth {
  status: string;
  health: 'healthy' | 'warning' | 'critical';
  issues: string[];
  recommendations: string[];
}

export interface UpcomingInvoice {
  amount: number;
  currency: string;
  periodStart: Date;
  periodEnd: Date;
  nextPaymentAttempt: Date | null;
}

export interface SubscriptionPreview {
  prorationAmount: number;
  nextInvoiceAmount: number;
  currency: string;
  effectiveDate: Date;
}

export interface PaymentRetryStats {
  totalRetries: number;
  successfulRetries: number;
  failedRetries: number;
  successRate: number;
  lastRetryDate: Date | null;
}

export interface UpgradeOptions {
  currentPlan: SubscriptionPlan & { level: number };
  availableUpgrades: (SubscriptionPlan & { isUpgrade: boolean; levelDifference: number })[];
  availableDowngrades: (SubscriptionPlan & { isDowngrade: boolean; levelDifference: number })[];
}

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private readonly API_URL = `${environment.API_CONFIG.BASE_URL}/api/v1/subscription`;

  constructor(private http: HttpClient) {}

  // 获取所有订阅计划
  getPlans(): Observable<{ success: boolean; data: SubscriptionPlan[] }> {
    return this.http.get<{ success: boolean; data: SubscriptionPlan[] }>(`${this.API_URL}/plans`);
  }

  // 获取当前订阅状态
  getSubscriptionStatus(): Observable<{ success: boolean; data: SubscriptionStatus }> {
    return this.http.get<{ success: boolean; data: SubscriptionStatus }>(`${this.API_URL}/status`);
  }

  // 创建结账会话
  createCheckoutSession(plan: string, successUrl: string, cancelUrl: string): Observable<{ success: boolean; data: { url: string } }> {
    return this.http.post<{ success: boolean; data: { url: string } }>(`${this.API_URL}/checkout`, {
      plan,
      successUrl,
      cancelUrl
    });
  }

  // 创建客户门户会话
  createPortalSession(returnUrl: string): Observable<{ success: boolean; data: { url: string } }> {
    return this.http.post<{ success: boolean; data: { url: string } }>(`${this.API_URL}/portal`, {
      returnUrl
    });
  }

  // 取消订阅
  cancelSubscription(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/cancel`, {});
  }

  // 重新激活订阅
  reactivateSubscription(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/reactivate`, {});
  }

  // 获取发票列表
  getInvoices(limit?: number): Observable<{ success: boolean; data: Invoice[] }> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this.http.get<{ success: boolean; data: Invoice[] }>(`${this.API_URL}/invoices`, { params });
  }

  // 获取即将到来的发票
  getUpcomingInvoice(): Observable<{ success: boolean; data: UpcomingInvoice | null }> {
    return this.http.get<{ success: boolean; data: UpcomingInvoice | null }>(`${this.API_URL}/upcoming-invoice`);
  }

  // 重试支付
  retryPayment(): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/retry-payment`, {});
  }

  // 获取使用情况
  getUsage(): Observable<{ success: boolean; data: SubscriptionUsage }> {
    return this.http.get<{ success: boolean; data: SubscriptionUsage }>(`${this.API_URL}/usage`);
  }

  // 获取支付历史
  getPaymentHistory(limit?: number): Observable<{ success: boolean; data: PaymentHistory }> {
    let params = new HttpParams();
    if (limit) {
      params = params.set('limit', limit.toString());
    }
    return this.http.get<{ success: boolean; data: PaymentHistory }>(`${this.API_URL}/payment-history`, { params });
  }

  // 获取订阅健康状态
  getSubscriptionHealth(): Observable<{ success: boolean; data: SubscriptionHealth }> {
    return this.http.get<{ success: boolean; data: SubscriptionHealth }>(`${this.API_URL}/subscription-health`);
  }

  // 更改订阅计划
  changePlan(plan: string, prorate: boolean = true): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/change-plan`, {
      plan,
      prorate
    });
  }

  // 预览订阅更改
  previewChange(plan: string): Observable<{ success: boolean; data: SubscriptionPreview }> {
    return this.http.post<{ success: boolean; data: SubscriptionPreview }>(`${this.API_URL}/preview-change`, {
      plan
    });
  }

  // 获取升级选项
  getUpgradeOptions(): Observable<{ success: boolean; data: UpgradeOptions }> {
    return this.http.get<{ success: boolean; data: UpgradeOptions }>(`${this.API_URL}/upgrade-options`);
  }

  // 重试特定发票的支付
  retryInvoicePayment(invoiceId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/retry-payment/${invoiceId}`, {});
  }

  // 获取支付重试统计
  getPaymentRetryStats(): Observable<{ success: boolean; data: PaymentRetryStats }> {
    return this.http.get<{ success: boolean; data: PaymentRetryStats }>(`${this.API_URL}/payment-retry-stats`);
  }
}