import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const API_CONFIG = environment.API_CONFIG;

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

export interface SetupIntent {
  clientSecret: string;
  setupIntentId: string;
}

export interface PaymentMethodResponse {
  success: boolean;
  data: PaymentMethod[];
}

export interface SetupIntentResponse {
  success: boolean;
  data: SetupIntent;
  clientSecret?: string;
}

export interface PaymentRetryRequest {
  paymentIntentId: string;
  paymentMethodId?: string;
}

export interface PaymentRetryResponse {
  success: boolean;
  data: {
    clientSecret: string;
    status: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class PaymentService {
  private readonly baseUrl = `${API_CONFIG.BASE_URL}/api/v1/payments`;

  constructor(private http: HttpClient) {}

  // 获取用户的支付方式列表
  getPaymentMethods(): Observable<PaymentMethodResponse> {
    return this.http.get<PaymentMethodResponse>(`${this.baseUrl}/methods`);
  }

  // 设置默认支付方式
  setDefaultPaymentMethod(paymentMethodId: string): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(
      `${this.baseUrl}/methods/${paymentMethodId}/default`,
      {}
    );
  }

  // 删除支付方式
  deletePaymentMethod(paymentMethodId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/methods/${paymentMethodId}`);
  }

  // 创建设置意图（用于添加新的支付方式）
  createSetupIntent(): Observable<SetupIntentResponse> {
    return this.http.post<SetupIntentResponse>(`${this.baseUrl}/setup-intent`, {});
  }

  // 重试失败的支付
  retryPayment(request: PaymentRetryRequest): Observable<PaymentRetryResponse> {
    return this.http.post<PaymentRetryResponse>(`${this.baseUrl}/retry`, request);
  }

  // 获取支付意图状态
  getPaymentIntentStatus(paymentIntentId: string): Observable<{
    success: boolean;
    data: {
      status: string;
      clientSecret?: string;
    };
  }> {
    return this.http.get<{
      success: boolean;
      data: {
        status: string;
        clientSecret?: string;
      };
    }>(`${this.baseUrl}/intent/${paymentIntentId}/status`);
  }

  // 确认支付意图
  confirmPaymentIntent(paymentIntentId: string, paymentMethodId: string): Observable<{
    success: boolean;
    data: {
      status: string;
      clientSecret?: string;
    };
  }> {
    return this.http.post<{
      success: boolean;
      data: {
        status: string;
        clientSecret?: string;
      };
    }>(`${this.baseUrl}/intent/${paymentIntentId}/confirm`, {
      paymentMethodId
    });
  }

  // 取消支付意图
  cancelPaymentIntent(paymentIntentId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>(
      `${this.baseUrl}/intent/${paymentIntentId}/cancel`,
      {}
    );
  }
}