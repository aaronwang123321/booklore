import { Component, OnInit, Input, Output, EventEmitter } from '@angular/core';
import { PaymentService } from '../../../services/payment.service';

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'succeeded' | 'canceled';
  clientSecret?: string;
  lastPaymentError?: {
    type: string;
    code: string;
    message: string;
  };
  paymentMethod?: {
    id: string;
    type: string;
    card?: {
      brand: string;
      last4: string;
      expMonth: number;
      expYear: number;
    };
  };
  description?: string;
  metadata?: Record<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
}

@Component({
  selector: 'app-payment-retry',
  templateUrl: './payment-retry.component.html',
  styleUrls: ['./payment-retry.component.css']
})
export class PaymentRetryComponent implements OnInit {
  @Input() paymentIntentId!: string;
  @Input() showModal: boolean = false;
  @Output() modalClosed = new EventEmitter<void>();
  @Output() paymentSucceeded = new EventEmitter<PaymentIntent>();
  @Output() paymentFailed = new EventEmitter<{ error: string; paymentIntent: PaymentIntent }>();

  paymentIntent: PaymentIntent | null = null;
  isLoading: boolean = false;
  isRetrying: boolean = false;
  error: string | null = null;
  retryAttempts: number = 0;
  maxRetryAttempts: number = 3;

  // 支付方式选择
  availablePaymentMethods: PaymentMethod[] = [];
  selectedPaymentMethodId: string | null = null;
  isLoadingPaymentMethods: boolean = false;

  constructor(
    private paymentService: PaymentService
  ) {}

  ngOnInit(): void {
    if (this.paymentIntentId) {
      this.loadPaymentIntent();
    }
  }

  ngOnChanges(): void {
    if (this.showModal && this.paymentIntentId) {
      this.loadPaymentIntent();
      this.loadPaymentMethods();
    }
  }

  async loadPaymentIntent(): Promise<void> {
    if (!this.paymentIntentId) return;

    this.isLoading = true;
    this.error = null;

    try {
      const response = await this.paymentService.getPaymentIntentStatus(this.paymentIntentId).toPromise();
      if (response?.data) {
        this.paymentIntent = response.data as PaymentIntent;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '加载支付信息失败';
      this.error = errorMessage;
      console.error('加载支付信息失败:', this.error);
    } finally {
      this.isLoading = false;
    }
  }

  async loadPaymentMethods(): Promise<void> {
    this.isLoadingPaymentMethods = true;
    
    try {
      const response = await this.paymentService.getPaymentMethods().toPromise();
      if (response?.data) {
        this.availablePaymentMethods = response.data as PaymentMethod[];
        
        // 默认选择第一个支付方式
        if (this.availablePaymentMethods.length > 0) {
          this.selectedPaymentMethodId = this.availablePaymentMethods[0].id;
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '加载支付方式失败';
      this.error = errorMessage;
      console.error('加载支付方式失败:', this.error);
    } finally {
      this.isLoadingPaymentMethods = false;
    }
  }

  async retryPayment(): Promise<void> {
    if (!this.paymentIntent || !this.selectedPaymentMethodId) {
      this.notificationService.showError('请选择支付方式');
      return;
    }

    if (this.retryAttempts >= this.maxRetryAttempts) {
      console.error('已达到最大重试次数，请稍后再试');
      return;
    }

    this.isRetrying = true;
    this.error = null;
    this.retryAttempts++;

    try {
      const response = await this.paymentService.retryPayment(
        this.paymentIntent.id
      ).toPromise();

      if (response?.data) {
        const updatedPaymentIntent = response.data as PaymentIntent;
        this.paymentIntent = updatedPaymentIntent;

        if (updatedPaymentIntent.status === 'succeeded') {
           console.log('支付成功！');
           this.paymentSucceeded.emit(updatedPaymentIntent);
           this.closeModal();
         } else if (updatedPaymentIntent.status === 'requires_action') {
           // 需要额外验证（如3D Secure）
           this.handleRequiresAction(updatedPaymentIntent);
         } else {
           throw new Error(updatedPaymentIntent.lastPaymentError?.message || '支付失败');
         }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '支付重试失败';
      this.error = errorMessage;
      console.error('支付重试失败:', this.error);
      
      if (this.paymentIntent) {
        this.paymentFailed.emit({ 
          error: this.error, 
          paymentIntent: this.paymentIntent 
        });
      }
    } finally {
      this.isRetrying = false;
    }
  }

  async confirmPayment(): Promise<void> {
    if (!this.paymentIntent?.clientSecret) {
      console.error('缺少支付确认信息');
      return;
    }

    this.isRetrying = true;
    this.error = null;

    try {
      const response = await this.paymentService.confirmPaymentIntent(
        this.paymentIntent.id
      ).toPromise();

      if (response?.data) {
        const confirmedPaymentIntent = response.data as PaymentIntent;
        this.paymentIntent = confirmedPaymentIntent;

        if (confirmedPaymentIntent.status === 'succeeded') {
           console.log('支付确认成功！');
           this.paymentSucceeded.emit(confirmedPaymentIntent);
           this.closeModal();
         } else {
           throw new Error(confirmedPaymentIntent.lastPaymentError?.message || '支付确认失败');
         }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : '支付确认失败';
      this.error = errorMessage;
      console.error('支付确认失败:', this.error);
      
      if (this.paymentIntent) {
        this.paymentFailed.emit({ 
          error: this.error, 
          paymentIntent: this.paymentIntent 
        });
      }
    } finally {
      this.isRetrying = false;
    }
  }

  async cancelPayment(): Promise<void> {
    if (!this.paymentIntent) return;

    if (confirm('确定要取消此次支付吗？')) {
      this.isLoading = true;
      
      try {
        await this.paymentService.cancelPaymentIntent(this.paymentIntent.id).toPromise();
        console.log('支付已取消');
        this.closeModal();
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : '取消支付失败';
        this.error = errorMessage;
        console.error('取消支付失败:', this.error);
      } finally {
        this.isLoading = false;
      }
    }
  }

  private handleRequiresAction(): void {
    // 这里应该集成Stripe的3D Secure处理
    // 暂时显示提示信息
    console.info('支付需要额外验证，请按照提示完成验证');
  }

  closeModal(): void {
    this.showModal = false;
    this.modalClosed.emit();
    this.resetComponent();
  }

  private resetComponent(): void {
    this.paymentIntent = null;
    this.error = null;
    this.retryAttempts = 0;
    this.selectedPaymentMethodId = null;
    this.availablePaymentMethods = [];
  }

  onPaymentMethodChange(paymentMethodId: string): void {
    this.selectedPaymentMethodId = paymentMethodId;
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'requires_payment_method': '需要支付方式',
      'requires_confirmation': '需要确认',
      'requires_action': '需要验证',
      'processing': '处理中',
      'succeeded': '成功',
      'canceled': '已取消'
    };
    return statusMap[status] || status;
  }

  getStatusClass(status: string): string {
    const statusClassMap: Record<string, string> = {
      'requires_payment_method': 'status-warning',
      'requires_confirmation': 'status-info',
      'requires_action': 'status-warning',
      'processing': 'status-info',
      'succeeded': 'status-success',
      'canceled': 'status-danger'
    };
    return statusClassMap[status] || 'status-default';
  }

  getErrorTypeText(errorType: string): string {
    const errorTypeMap: Record<string, string> = {
      'card_error': '银行卡错误',
      'validation_error': '验证错误',
      'api_error': '系统错误',
      'authentication_error': '认证错误',
      'rate_limit_error': '请求过于频繁',
      'idempotency_error': '重复请求'
    };
    return errorTypeMap[errorType] || errorType;
  }

  formatCurrency(amount: number, currency: string): string {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: 2
    }).format(amount / 100); // Stripe金额以分为单位
  }

  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  }

  canRetry(): boolean {
    return this.paymentIntent?.status === 'requires_payment_method' && 
           this.retryAttempts < this.maxRetryAttempts &&
           !this.isRetrying;
  }

  canConfirm(): boolean {
    return this.paymentIntent?.status === 'requires_confirmation' && 
           !this.isRetrying;
  }

  canCancel(): boolean {
    return this.paymentIntent?.status !== 'succeeded' && 
           this.paymentIntent?.status !== 'canceled' &&
           !this.isRetrying;
  }
}