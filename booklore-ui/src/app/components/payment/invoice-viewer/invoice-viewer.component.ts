import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { PaymentAnalyticsService } from '../../../services/payment-analytics.service';

export interface Invoice {
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
}

@Component({
  selector: 'app-invoice-viewer',
  templateUrl: './invoice-viewer.component.html',
  styleUrls: ['./invoice-viewer.component.css']
})
export class InvoiceViewerComponent implements OnInit {
  invoice: Invoice | null = null;
  isLoading = false;
  error: string | null = null;
  invoiceId: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private paymentAnalyticsService: PaymentAnalyticsService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.invoiceId = params['id'];
      if (this.invoiceId) {
        this.loadInvoice();
      }
    });
  }

  async loadInvoice(): Promise<void> {
    if (!this.invoiceId) {
      this.error = '发票ID无效';
      return;
    }

    this.isLoading = true;
    this.error = null;

    try {
      const response = await this.paymentAnalyticsService.getInvoiceDetails(this.invoiceId).toPromise();
      if (response && response.data) {
        this.invoice = response.data;
      } else {
        throw new Error('Failed to load invoice');
      }
    } catch (error) {
      console.error('Failed to load invoice:', error);
      this.error = '加载发票失败，请稍后重试';
    } finally {
      this.isLoading = false;
    }
  }

  async downloadInvoice(): Promise<void> {
    if (!this.invoice) {
      return;
    }

    try {
      const downloadUrl = this.invoice.pdfUrl || this.invoice.hostedUrl;
      if (downloadUrl) {
        window.open(downloadUrl, '_blank');
      } else {
        alert('发票下载链接不可用');
      }
    } catch (error) {
      console.error('Failed to download invoice:', error);
      alert('下载发票失败，请稍后重试');
    }
  }

  async printInvoice(): Promise<void> {
    try {
      window.print();
    } catch (error) {
      console.error('Failed to print invoice:', error);
      alert('打印发票失败，请稍后重试');
    }
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'draft': '草稿',
      'open': '待付款',
      'paid': '已付款',
      'void': '已作废',
      'uncollectible': '无法收取'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const statusClassMap: Record<string, string> = {
      'draft': 'status-secondary',
      'open': 'status-warning',
      'paid': 'status-success',
      'void': 'status-danger',
      'uncollectible': 'status-danger'
    };
    return statusClassMap[status] || 'status-default';
  }

  formatCurrency(amount: number, currency: string = 'CNY'): string {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2
    }).format(amount / 100);
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  getFormattedAddress(address: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  } | undefined): string {
    if (!address) {
      return '';
    }

    const parts = [];
    if (address.line1) parts.push(address.line1);
    if (address.line2) parts.push(address.line2);
    if (address.city) parts.push(address.city);
    if (address.state) parts.push(address.state);
    if (address.postalCode) parts.push(address.postalCode);
    if (address.country) parts.push(address.country);

    return parts.join(', ');
  }

  goBack(): void {
    window.history.back();
  }
}