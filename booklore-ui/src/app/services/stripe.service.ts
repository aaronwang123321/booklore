import { Injectable, inject } from '@angular/core';
import { loadStripe, Stripe, StripeElements, StripeCardElement, PaymentIntentResult, PaymentMethodResult } from '@stripe/stripe-js';
import { Observable, BehaviorSubject } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface PaymentIntent {
  id: string;
  client_secret: string;
  amount: number;
  currency: string;
  status: string;
}

export interface StripeConfig {
  publishableKey: string;
  apiVersion?: string;
}

@Injectable({
  providedIn: 'root'
})
export class StripeService {
  private http = inject(HttpClient);
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private cardElement: StripeCardElement | null = null;
  
  private stripeLoadedSubject = new BehaviorSubject<boolean>(false);
  public stripeLoaded$ = this.stripeLoadedSubject.asObservable();

  private readonly STRIPE_PUBLISHABLE_KEY = 'pk_test_your_key_here'; // TODO: Move to environment config

  constructor() {
    this.initializeStripe();
  }

  private async initializeStripe(): Promise<void> {
    try {
      this.stripe = await loadStripe(this.STRIPE_PUBLISHABLE_KEY);
      if (this.stripe) {
        this.stripeLoadedSubject.next(true);
      }
    } catch (error) {
      console.error('Failed to load Stripe:', error);
      this.stripeLoadedSubject.next(false);
    }
  }

  getStripe(): Stripe | null {
    return this.stripe;
  }

  createElements(): StripeElements | null {
    if (!this.stripe) {
      console.error('Stripe not initialized');
      return null;
    }
    
    this.elements = this.stripe.elements({
      appearance: {
        theme: 'stripe',
        variables: {
          colorPrimary: '#0570de',
          colorBackground: '#ffffff',
          colorText: '#30313d',
          colorDanger: '#df1b41',
          fontFamily: 'Ideal Sans, system-ui, sans-serif',
          spacingUnit: '2px',
          borderRadius: '4px'
        }
      }
    });
    
    return this.elements;
  }

  createCardElement(containerId: string): StripeCardElement | null {
    if (!this.elements) {
      this.createElements();
    }
    
    if (!this.elements) {
      console.error('Failed to create Stripe elements');
      return null;
    }

    this.cardElement = this.elements.create('card', {
      style: {
        base: {
          fontSize: '16px',
          color: '#424770',
          '::placeholder': {
            color: '#aab7c4',
          },
        },
        invalid: {
          color: '#9e2146',
        },
      },
    });

    const container = document.getElementById(containerId);
    if (container && this.cardElement) {
      this.cardElement.mount(container);
    }

    return this.cardElement;
  }

  createPaymentIntent(amount: number, currency: string = 'usd', metadata?: Record<string, string>): Observable<PaymentIntent> {
    const payload = {
      amount: amount * 100, // Convert to cents
      currency,
      metadata
    };
    
    return this.http.post<PaymentIntent>('/api/payments/create-payment-intent', payload);
  }

  async confirmCardPayment(clientSecret: string, cardElement?: StripeCardElement): Promise<PaymentIntentResult> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const element = cardElement || this.cardElement;
    if (!element) {
      throw new Error('Card element not found');
    }

    return await this.stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: element,
      }
    });
  }

  async createPaymentMethod(cardElement?: StripeCardElement, billingDetails?: {name?: string; email?: string; address?: {line1?: string; city?: string; country?: string; postal_code?: string}}): Promise<PaymentMethodResult> {
    if (!this.stripe) {
      throw new Error('Stripe not initialized');
    }

    const element = cardElement || this.cardElement;
    if (!element) {
      throw new Error('Card element not found');
    }

    return await this.stripe.createPaymentMethod({
      type: 'card',
      card: element,
      billing_details: billingDetails
    });
  }

  attachPaymentMethod(paymentMethodId: string, customerId: string): Observable<{success: boolean; message?: string}> {
    return this.http.post<{success: boolean; message?: string}>('/api/payments/attach-payment-method', {
      payment_method_id: paymentMethodId,
      customer_id: customerId
    });
  }

  detachPaymentMethod(paymentMethodId: string): Observable<{success: boolean; message?: string}> {
    return this.http.post<{success: boolean; message?: string}>('/api/payments/detach-payment-method', {
      payment_method_id: paymentMethodId
    });
  }

  getCustomerPaymentMethods(customerId: string): Observable<{data: Record<string, unknown>[]}> {
    return this.http.get<{data: Record<string, unknown>[]}>(`/api/payments/customer/${customerId}/payment-methods`);
  }

  createSubscription(customerId: string, priceId: string, paymentMethodId?: string): Observable<{subscription: Record<string, unknown>; success: boolean}> {
    const payload: {customer_id: string; price_id: string; payment_method_id?: string} = {
      customer_id: customerId,
      price_id: priceId
    };
    
    if (paymentMethodId) {
      payload.payment_method_id = paymentMethodId;
    }
    
    return this.http.post<{subscription: Record<string, unknown>; success: boolean}>('/api/subscriptions/create', payload);
  }

  updateSubscription(subscriptionId: string, priceId: string): Observable<{subscription: Record<string, unknown>; success: boolean}> {
    return this.http.put<{subscription: Record<string, unknown>; success: boolean}>(`/api/subscriptions/${subscriptionId}`, {
      price_id: priceId
    });
  }

  cancelSubscription(subscriptionId: string, cancelAtPeriodEnd: boolean = true): Observable<{subscription: Record<string, unknown>; success: boolean}> {
    return this.http.post<{subscription: Record<string, unknown>; success: boolean}>(`/api/subscriptions/${subscriptionId}/cancel`, {
      cancel_at_period_end: cancelAtPeriodEnd
    });
  }

  reactivateSubscription(subscriptionId: string): Observable<{subscription: Record<string, unknown>; success: boolean}> {
    return this.http.post<{subscription: Record<string, unknown>; success: boolean}>(`/api/subscriptions/${subscriptionId}/reactivate`, {});
  }

  getInvoices(customerId: string, limit: number = 10): Observable<{data: Record<string, unknown>[]}> {
    return this.http.get<{data: Record<string, unknown>[]}>(`/api/payments/customer/${customerId}/invoices`, {
      params: { limit: limit.toString() }
    });
  }

  downloadInvoice(invoiceId: string): Observable<Blob> {
    return this.http.get(`/api/payments/invoices/${invoiceId}/pdf`, {
      responseType: 'blob'
    });
  }

  retryInvoicePayment(invoiceId: string, paymentMethodId?: string): Observable<{success: boolean; invoice?: Record<string, unknown>}> {
    const payload: {invoice_id: string; payment_method_id?: string} = { invoice_id: invoiceId };
    if (paymentMethodId) {
      payload.payment_method_id = paymentMethodId;
    }
    
    return this.http.post<{success: boolean; invoice?: Record<string, unknown>}>('/api/payments/retry-invoice', payload);
  }

  validateCardElement(cardElement?: StripeCardElement): Promise<boolean> {
    return new Promise((resolve) => {
      const element = cardElement || this.cardElement;
      if (!element) {
        resolve(false);
        return;
      }

      element.on('change', (event) => {
        resolve(event.complete && !event.error);
      });
    });
  }

  destroyCardElement(): void {
    if (this.cardElement) {
      this.cardElement.destroy();
      this.cardElement = null;
    }
  }

  destroyElements(): void {
    this.destroyCardElement();
    this.elements = null;
  }
}