import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SubscriptionService, PaymentHistory, Invoice } from '../../../services/subscription.service';

@Component({
  selector: 'app-payment-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-history.component.html',
  styleUrls: ['./payment-history.component.css']
})
export class PaymentHistoryComponent implements OnInit {
  paymentHistory: PaymentHistory | null = null;
  invoices: Invoice[] = [];
  loading = true;
  error: string | null = null;
  
  // 筛选选项
  selectedPeriod = 'all';
  selectedStatus = 'all';
  searchTerm = '';
  
  // 分页
  currentPage = 1;
  itemsPerPage = 10;
  totalItems = 0;

  constructor(private subscriptionService: SubscriptionService) {}

  ngOnInit(): void {
    this.loadPaymentData();
  }

  loadPaymentData(): void {
    this.loading = true;
    this.error = null;

    let paymentHistoryLoaded = false;
    let invoicesLoaded = false;

    const checkLoadingComplete = () => {
      if (paymentHistoryLoaded && invoicesLoaded) {
        this.loading = false;
      }
    };

    // 加载支付历史
    this.subscriptionService.getPaymentHistory(50).subscribe({
      next: (response) => {
        if (response.success) {
          this.paymentHistory = response.data;
          this.totalItems = this.paymentHistory.payments.length;
        } else {
          this.error = '获取支付历史失败';
        }
      },
      error: (error) => {
        console.error('获取支付历史失败:', error);
        this.error = '获取支付历史失败，请稍后重试';
      },
      complete: () => {
        paymentHistoryLoaded = true;
        checkLoadingComplete();
      }
    });

    // 加载发票
    this.subscriptionService.getInvoices(50).subscribe({
      next: (response) => {
        if (response.success) {
          this.invoices = response.data;
        }
      },
      error: (error) => {
        console.error('获取发票失败:', error);
      },
      complete: () => {
        invoicesLoaded = true;
        checkLoadingComplete();
      }
    });
  }

  get filteredPayments() {
    if (!this.paymentHistory) {
      return [];
    }

    let filtered = [...this.paymentHistory.payments];

    // 按时间筛选
    if (this.selectedPeriod !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (this.selectedPeriod) {
        case 'last_month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        case 'last_3_months':
          filterDate.setMonth(now.getMonth() - 3);
          break;
        case 'last_6_months':
          filterDate.setMonth(now.getMonth() - 6);
          break;
        case 'last_year':
          filterDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      filtered = filtered.filter(payment => new Date(payment.date) >= filterDate);
    }

    // 按搜索词筛选
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(payment => 
        payment.id.toLowerCase().includes(term) ||
        payment.description.toLowerCase().includes(term)
      );
    }

    return filtered;
  }

  get filteredInvoices() {
    let filtered = [...this.invoices];

    // 按状态筛选
    if (this.selectedStatus !== 'all') {
      filtered = filtered.filter(invoice => invoice.status === this.selectedStatus);
    }

    // 按时间筛选
    if (this.selectedPeriod !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (this.selectedPeriod) {
        case 'last_month':
          filterDate.setMonth(now.getMonth() - 1);
          break;
        case 'last_3_months':
          filterDate.setMonth(now.getMonth() - 3);
          break;
        case 'last_6_months':
          filterDate.setMonth(now.getMonth() - 6);
          break;
        case 'last_year':
          filterDate.setFullYear(now.getFullYear() - 1);
          break;
      }
      
      filtered = filtered.filter(invoice => new Date(invoice.created) >= filterDate);
    }

    // 按搜索词筛选
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(invoice => 
        invoice.id.toLowerCase().includes(term)
      );
    }

    return filtered;
  }

  get paginatedPayments() {
    const filtered = this.filteredPayments;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return filtered.slice(startIndex, startIndex + this.itemsPerPage);
  }

  get paginatedInvoices() {
    const filtered = this.filteredInvoices;
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    return filtered.slice(startIndex, startIndex + this.itemsPerPage);
  }

  get totalPages() {
    const totalItems = Math.max(this.filteredPayments.length, this.filteredInvoices.length);
    return Math.ceil(totalItems / this.itemsPerPage);
  }

  onFilterChange(): void {
    this.currentPage = 1;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }

  downloadInvoice(invoice: Invoice): void {
    if (invoice.hostedUrl) {
      window.open(invoice.hostedUrl, '_blank');
    } else if (invoice.pdfUrl) {
      window.open(invoice.pdfUrl, '_blank');
    }
  }

  downloadPaymentReceipt(payment: { pdfUrl?: string; hostedUrl?: string }): void {
    if (payment.pdfUrl) {
      window.open(payment.pdfUrl, '_blank');
    } else if (payment.hostedUrl) {
      window.open(payment.hostedUrl, '_blank');
    }
  }

  formatCurrency(amount: number): string {
    return `$${(amount / 100).toFixed(2)}`;
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'paid': '已支付',
      'open': '待支付',
      'void': '已作废',
      'uncollectible': '无法收取',
      'draft': '草稿',
      'succeeded': '成功',
      'pending': '处理中',
      'failed': '失败'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const statusClassMap: Record<string, string> = {
      'paid': 'status-success',
      'succeeded': 'status-success',
      'open': 'status-warning',
      'pending': 'status-warning',
      'void': 'status-secondary',
      'draft': 'status-secondary',
      'uncollectible': 'status-danger',
      'failed': 'status-danger'
    };
    return statusClassMap[status] || 'status-default';
  }

  exportData(): void {
    // 这里可以实现导出功能
    const data = {
      payments: this.filteredPayments,
      invoices: this.filteredInvoices,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payment-history-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }
}