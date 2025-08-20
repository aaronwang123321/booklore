import { Component, OnInit } from '@angular/core';
import { PaymentService } from '../../../services/payment.service';
import { SubscriptionService } from '../../../services/subscription.service';

export interface PaymentMethod {
  id: string;
  type: string;
  brand?: string;
  last4?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
  createdAt: string;
}

@Component({
  selector: 'app-payment-methods',
  templateUrl: './payment-methods.component.html',
  styleUrls: ['./payment-methods.component.css']
})
export class PaymentMethodsComponent implements OnInit {
  paymentMethods: PaymentMethod[] = [];
  isLoading = false;
  error: string | null = null;
  isAddingPaymentMethod = false;
  showAddForm = false;

  constructor(
    private paymentService: PaymentService,
    private subscriptionService: SubscriptionService
  ) {}

  ngOnInit(): void {
    this.loadPaymentMethods();
  }

  async loadPaymentMethods(): Promise<void> {
    this.isLoading = true;
    this.error = null;

    try {
      const response = await this.paymentService.getPaymentMethods().toPromise();
      this.paymentMethods = response?.data || [];
    } catch (error) {
      console.error('Failed to load payment methods:', error);
      this.error = '加载支付方式失败，请稍后重试';
    } finally {
      this.isLoading = false;
    }
  }

  async setDefaultPaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      await this.paymentService.setDefaultPaymentMethod(paymentMethodId).toPromise();
      
      // 更新本地状态
      this.paymentMethods.forEach(method => {
        method.isDefault = method.id === paymentMethodId;
      });
      
      alert('默认支付方式设置成功');
    } catch (error) {
      console.error('Failed to set default payment method:', error);
      alert('设置默认支付方式失败，请稍后重试');
    }
  }

  async deletePaymentMethod(paymentMethodId: string): Promise<void> {
    if (!confirm('确定要删除这个支付方式吗？')) {
      return;
    }

    try {
      await this.paymentService.deletePaymentMethod(paymentMethodId).toPromise();
      
      // 从本地列表中移除
      this.paymentMethods = this.paymentMethods.filter(method => method.id !== paymentMethodId);
      
      alert('支付方式删除成功');
    } catch (error) {
      console.error('Failed to delete payment method:', error);
      alert('删除支付方式失败，请稍后重试');
    }
  }

  async addPaymentMethod(): Promise<void> {
    this.isAddingPaymentMethod = true;
    
    try {
      // 创建 Stripe 设置意图
      const response = await this.paymentService.createSetupIntent().toPromise();
      
      if (response && response.data && response.data.clientSecret) {
        // 重定向到 Stripe 支付方式设置页面
        window.location.href = `/payment/setup?client_secret=${response.data.clientSecret}`;
      } else {
        throw new Error('Failed to create setup intent');
      }
    } catch (error) {
      console.error('Failed to add payment method:', error);
      alert('添加支付方式失败，请稍后重试');
    } finally {
      this.isAddingPaymentMethod = false;
    }
  }

  async openCustomerPortal(): Promise<void> {
    try {
      const response = await this.subscriptionService.createPortalSession(
        window.location.origin + '/payment/methods'
      ).toPromise();
      
      if (response && response.data && response.data.url) {
        window.location.href = response.data.url;
      } else {
        throw new Error('Failed to create portal session');
      }
    } catch (error) {
      console.error('Failed to open customer portal:', error);
      alert('打开客户门户失败，请稍后重试');
    }
  }

  getPaymentMethodIcon(type: string, brand?: string): string {
    if (type === 'card') {
      switch (brand?.toLowerCase()) {
        case 'visa':
          return '💳';
        case 'mastercard':
          return '💳';
        case 'amex':
          return '💳';
        case 'discover':
          return '💳';
        default:
          return '💳';
      }
    }
    return '💰';
  }

  getPaymentMethodDisplay(method: PaymentMethod): string {
    if (method.type === 'card') {
      const brand = method.brand ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1) : 'Card';
      return `${brand} •••• ${method.last4}`;
    }
    return method.type;
  }

  getExpiryDisplay(method: PaymentMethod): string {
    if (method.expiryMonth && method.expiryYear) {
      return `${method.expiryMonth.toString().padStart(2, '0')}/${method.expiryYear.toString().slice(-2)}`;
    }
    return '';
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  isExpiringSoon(method: PaymentMethod): boolean {
    if (!method.expiryMonth || !method.expiryYear) {
      return false;
    }
    
    const now = new Date();
    const expiry = new Date(method.expiryYear, method.expiryMonth - 1);
    const threeMonthsFromNow = new Date();
    threeMonthsFromNow.setMonth(now.getMonth() + 3);
    
    return expiry <= threeMonthsFromNow;
  }
}