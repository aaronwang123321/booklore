import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { PaymentFormComponent, PaymentFormData, PaymentResult } from '../../payment/payment-form/payment-form.component';
import { SubscriptionService, SubscriptionPlan } from '../../../services/subscription.service';
import { StripeService } from '../../../services/stripe.service';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { Divider } from 'primeng/divider';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Subscription } from 'rxjs';



@Component({
  selector: 'app-subscription-checkout',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    PaymentFormComponent,
    Button,
    Card,
    Divider,
    Message,
    ProgressSpinner
  ],
  templateUrl: './subscription-checkout.component.html',
  styleUrls: ['./subscription-checkout.component.css']
})
export class SubscriptionCheckoutComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private subscriptionService = inject(SubscriptionService);
  private stripeService = inject(StripeService);
  private fb = inject(FormBuilder);
  
  selectedPlan: SubscriptionPlan | null = null;
  paymentFormData: PaymentFormData = {
    amount: 0,
    currency: 'usd',
    description: ''
  };
  
  isLoading: boolean = true;
  isProcessing: boolean = false;
  errorMessage: string = '';
  successMessage: string = '';
  
  checkoutForm: FormGroup;
  private subscriptions: Subscription[] = [];
  
  constructor() {
    this.checkoutForm = this.fb.group({
      planId: ['', Validators.required],
      couponCode: [''],
      agreeToTerms: [false, Validators.requiredTrue]
    });
  }
  
  ngOnInit(): void {
    this.loadSelectedPlan();
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }
  
  private loadSelectedPlan(): void {
    const planId = this.route.snapshot.queryParams['planId'];
    
    if (!planId) {
      this.router.navigate(['/subscription']);
      return;
    }
    
    this.isLoading = true;
    
    const sub = this.subscriptionService.getPlans().subscribe({
      next: (response) => {
        const plan = response.data.find(p => p.id === planId);
        if (plan) {
          this.selectedPlan = plan;
          this.updatePaymentFormData();
          this.checkoutForm.patchValue({ planId: plan.id });
        } else {
          this.errorMessage = 'Subscription plan not found';
        }
        this.isLoading = false;
      },
      error: () => {
        this.errorMessage = 'Failed to load subscription plan';
        this.isLoading = false;
      }
    });
    
    this.subscriptions.push(sub);
  }
  
  private updatePaymentFormData(): void {
    if (!this.selectedPlan) return;
    
    this.paymentFormData = {
      amount: this.selectedPlan.price,
      currency: this.selectedPlan.currency,
      description: `${this.selectedPlan.name} subscription`,
      metadata: {
        planId: this.selectedPlan.id,
        planName: this.selectedPlan.name,
        interval: this.selectedPlan.interval
      }
    };
  }
  
  onPaymentSuccess(result: PaymentResult): void {
    if (!this.selectedPlan || !result.paymentIntentId) {
      this.onPaymentError({ success: false, error: 'Invalid payment result' });
      return;
    }
    
    this.isProcessing = true;
    
    const subscriptionData = {
      planId: this.selectedPlan.id,
      paymentIntentId: result.paymentIntentId,
      couponCode: this.checkoutForm.get('couponCode')?.value || undefined
    };
    
    const sub = this.subscriptionService.createCheckoutSession(
      subscriptionData.planId,
      window.location.origin + '/subscription?success=true',
      window.location.origin + '/subscription?canceled=true'
    ).subscribe({
      next: () => {
        this.successMessage = 'Subscription created successfully!';
        this.isProcessing = false;
        
        // Redirect to subscription management after 2 seconds
        setTimeout(() => {
          this.router.navigate(['/subscription'], {
            queryParams: { success: 'true' }
          });
        }, 2000);
      },
      error: () => {
        this.errorMessage = 'Failed to create subscription. Please contact support.';
        this.isProcessing = false;
      }
    });
    
    this.subscriptions.push(sub);
  }
  
  onPaymentError(result: PaymentResult): void {
    this.errorMessage = result.error || 'Payment failed. Please try again.';
    this.isProcessing = false;
  }
  
  onFormValidityChange(): void {
    // Handle form validity changes if needed
  }
  
  applyCoupon(): void {
    const couponCode = this.checkoutForm.get('couponCode')?.value;
    
    if (!couponCode || !this.selectedPlan) {
      return;
    }
    
    // Note: Coupon validation would need to be implemented in the backend
    // For now, show a placeholder message
    this.errorMessage = 'Coupon validation is not yet implemented';
  }
  
  private calculateDiscountedAmount(originalAmount: number, discount: { type: string; value: number }): number {
    if (discount.type === 'percentage') {
      return Math.round(originalAmount * (1 - discount.value / 100));
    } else {
      return Math.max(0, originalAmount - discount.value);
    }
  }
  
  goBack(): void {
    this.router.navigate(['/subscription']);
  }
  
  get formattedPrice(): string {
    if (!this.selectedPlan) return '';
    return (this.selectedPlan.price / 100).toFixed(2);
  }
  
  get formattedInterval(): string {
    if (!this.selectedPlan) return '';
    return this.selectedPlan.interval === 'month' ? 'monthly' : 'yearly';
  }
  
  get canProceed(): boolean {
    return this.checkoutForm.valid && !this.isProcessing && !this.isLoading;
  }
}