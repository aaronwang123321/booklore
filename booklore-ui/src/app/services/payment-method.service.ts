import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface PaymentMethod {
  id: string;
  type: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  isDefault: boolean;
  created: Date;
}

export interface SetupIntent {
  clientSecret: string;
  setupIntentId: string;
}

export interface Coupon {
  id: string;
  name: string;
  percentOff?: number;
  amountOff?: number;
  currency?: string;
  duration: string;
  valid: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PaymentMethodService {
  private readonly API_URL = `${environment.API_CONFIG.BASE_URL}/api/v1/payment-methods`;

  constructor(private http: HttpClient) {}

  // 获取用户的支付方式列表
  getPaymentMethods(): Observable<{ success: boolean; data: PaymentMethod[] }> {
    return this.http.get<{ success: boolean; data: PaymentMethod[] }>(`${this.API_URL}`);
  }

  // 创建设置意图（用于添加新的支付方式）
  createSetupIntent(): Observable<{ success: boolean; data: SetupIntent }> {
    return this.http.post<{ success: boolean; data: SetupIntent }>(`${this.API_URL}/setup-intent`, {});
  }

  // 附加支付方式
  attachPaymentMethod(paymentMethodId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/attach`, {
      paymentMethodId
    });
  }

  // 设置默认支付方式
  setDefaultPaymentMethod(paymentMethodId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/set-default`, {
      paymentMethodId
    });
  }

  // 删除支付方式
  deletePaymentMethod(paymentMethodId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.API_URL}/${paymentMethodId}`);
  }

  // 验证优惠券
  validateCoupon(couponCode: string): Observable<{ success: boolean; data: Coupon }> {
    return this.http.post<{ success: boolean; data: Coupon }>(`${this.API_URL}/validate-coupon`, {
      couponCode
    });
  }

  // 应用优惠券
  applyCoupon(couponCode: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.API_URL}/apply-coupon`, {
      couponCode
    });
  }

  // 移除优惠券
  removeCoupon(): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.API_URL}/coupon`);
  }

  // 获取当前应用的优惠券
  getCurrentCoupon(): Observable<{ success: boolean; data: Coupon | null }> {
    return this.http.get<{ success: boolean; data: Coupon | null }>(`${this.API_URL}/current-coupon`);
  }
}