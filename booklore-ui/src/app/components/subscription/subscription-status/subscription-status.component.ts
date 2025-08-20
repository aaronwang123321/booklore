import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { SubscriptionService, SubscriptionStatus, Invoice } from '../../../services/subscription.service';

@Component({
  selector: 'app-subscription-status',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './subscription-status.component.html',
  styleUrls: ['./subscription-status.component.css']
})
export class SubscriptionStatusComponent implements OnInit {
  subscription: SubscriptionStatus | null = null;
  invoices: Invoice[] = [];
  loading = true;
  error: string | null = null;
  processing = false;

  constructor(
    private subscriptionService: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadSubscriptionData();
  }

  loadSubscriptionData(): void {
    this.loading = true;
    this.error = null;

    // 加载订阅状态
    this.subscriptionService.getSubscriptionStatus().subscribe({
      next: (response) => {
        if (response.success) {
          this.subscription = response.data;
        } else {
          this.error = '获取订阅状态失败';
        }
      },
      error: (error) => {
        console.error('获取订阅状态失败:', error);
        this.error = '获取订阅状态失败，请稍后重试';
      },
      complete: () => {
        this.loading = false;
      }
    });

    // 加载发票历史
    this.loadInvoices();
  }

  loadInvoices(): void {
    this.subscriptionService.getInvoices().subscribe({
      next: (response) => {
        if (response.success) {
          this.invoices = response.data;
        }
      },
      error: (error) => {
        console.error('获取发票失败:', error);
      }
    });
  }

  cancelSubscription(): void {
    if (!this.subscription || this.processing) {
      return;
    }

    if (!confirm('确定要取消订阅吗？取消后将在当前计费周期结束时生效。')) {
      return;
    }

    this.processing = true;
    this.subscriptionService.cancelSubscription().subscribe({
      next: (response) => {
        if (response.success) {
          alert('订阅已成功取消');
          this.loadSubscriptionData();
        } else {
          alert(response.message || '取消订阅失败');
        }
      },
      error: (error) => {
        console.error('取消订阅失败:', error);
        alert('取消订阅失败，请稍后重试');
      },
      complete: () => {
        this.processing = false;
      }
    });
  }

  reactivateSubscription(): void {
    if (!this.subscription || this.processing) {
      return;
    }

    this.processing = true;
    this.subscriptionService.reactivateSubscription().subscribe({
      next: (response) => {
        if (response.success) {
          alert('订阅已成功重新激活');
          this.loadSubscriptionData();
        } else {
          alert(response.message || '重新激活订阅失败');
        }
      },
      error: (error) => {
        console.error('重新激活订阅失败:', error);
        alert('重新激活订阅失败，请稍后重试');
      },
      complete: () => {
        this.processing = false;
      }
    });
  }

  openCustomerPortal(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    const returnUrl = window.location.href;
    this.subscriptionService.createPortalSession(returnUrl).subscribe({
      next: (response) => {
        if (response.success && response.data.url) {
          window.open(response.data.url, '_blank');
        } else {
          alert('打开客户门户失败');
        }
      },
      error: (error) => {
        console.error('打开客户门户失败:', error);
        alert('打开客户门户失败，请稍后重试');
      },
      complete: () => {
        this.processing = false;
      }
    });
  }

  changePlan(): void {
    this.router.navigate(['/subscription/plans']);
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'active': '活跃',
      'canceled': '已取消',
      'past_due': '逾期',
      'unpaid': '未支付',
      'incomplete': '未完成',
      'incomplete_expired': '已过期',
      'trialing': '试用中',
      'paused': '已暂停'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const statusClassMap: Record<string, string> = {
      'active': 'status-active',
      'trialing': 'status-active',
      'canceled': 'status-canceled',
      'past_due': 'status-warning',
      'unpaid': 'status-warning',
      'incomplete': 'status-warning',
      'incomplete_expired': 'status-error',
      'paused': 'status-paused'
    };
    return statusClassMap[status] || 'status-default';
  }

  getInvoiceStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'paid': '已支付',
      'open': '待支付',
      'void': '已作废',
      'uncollectible': '无法收取',
      'draft': '草稿'
    };
    return statusMap[status] || status;
  }

  downloadInvoice(invoice: Invoice): void {
    if (invoice.hostedUrl) {
      window.open(invoice.hostedUrl, '_blank');
    } else if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, '_blank');
    }
  }

  formatCurrency(amount: number): string {
    return `$${(amount / 100).toFixed(2)}`;
  }
}