import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { StripeService } from '../../../services/stripe.service';
import { StripeCardElement } from '@stripe/stripe-js';
import { Button } from 'primeng/button';
import { Card } from 'primeng/card';
import { InputText } from 'primeng/inputtext';
import { Message } from 'primeng/message';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Subscription } from 'rxjs';

export interface PaymentFormData {
  amount: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentResult {
  success: boolean;
  paymentIntentId?: string;
  error?: string;
}

@Component({
  selector: 'app-payment-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    Button,
    Card,
    InputText,
    Message,
    ProgressSpinner
  ],
  templateUrl: './payment-form.component.html',
  styleUrls: ['./payment-form.component.css']
})
export class PaymentFormComponent implements OnInit, OnDestroy {
  @Input() paymentData: PaymentFormData = {
    amount: 0,
    currency: 'usd'
  };
  @Input() showBillingDetails: boolean = true;
  @Input() submitButtonText: string = 'Pay Now';
  @Input() disabled: boolean = false;
  
  @Output() paymentSuccess = new EventEmitter<PaymentResult>();
  @Output() paymentError = new EventEmitter<PaymentResult>();
  @Output() formValidityChange = new EventEmitter<boolean>();
  
  @ViewChild('cardElement', { static: true }) cardElementRef!: ElementRef;
  
  private stripeService = inject(StripeService);
  private fb = inject(FormBuilder);
  
  paymentForm: FormGroup;
  cardElement: StripeCardElement | null = null;
  isProcessing: boolean = false;
  errorMessage: string = '';
  stripeLoaded: boolean = false;
  cardValid: boolean = false;
  
  private subscriptions: Subscription[] = [];
  
  constructor() {
    this.paymentForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      name: ['', Validators.required],
      address: this.fb.group({
        line1: ['', Validators.required],
        line2: [''],
        city: ['', Validators.required],
        state: ['', Validators.required],
        postal_code: ['', Validators.required],
        country: ['US', Validators.required]
      })
    });
  }
  
  ngOnInit(): void {
    this.subscribeToStripeLoaded();
    this.subscribeToFormChanges();
  }
  
  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.destroyCardElement();
  }
  
  private subscribeToStripeLoaded(): void {
    const sub = this.stripeService.stripeLoaded$.subscribe(loaded => {
      this.stripeLoaded = loaded;
      if (loaded) {
        this.initializeCardElement();
      }
    });
    this.subscriptions.push(sub);
  }
  
  private subscribeToFormChanges(): void {
    const sub = this.paymentForm.valueChanges.subscribe(() => {
      this.updateFormValidity();
    });
    this.subscriptions.push(sub);
  }
  
  private initializeCardElement(): void {
    if (!this.cardElementRef?.nativeElement) {
      console.error('Card element container not found');
      return;
    }
    
    this.cardElement = this.stripeService.createCardElement('card-element');
    
    if (this.cardElement) {
      this.cardElement.on('change', (event) => {
        this.cardValid = event.complete && !event.error;
        this.errorMessage = event.error?.message || '';
        this.updateFormValidity();
      });
      
      this.cardElement.on('ready', () => {
        console.log('Card element ready');
      });
    }
  }
  
  private updateFormValidity(): void {
    const formValid = this.paymentForm.valid && this.cardValid;
    this.formValidityChange.emit(formValid);
  }
  
  async onSubmit(): Promise<void> {
    if (this.isProcessing || !this.paymentForm.valid || !this.cardValid) {
      return;
    }
    
    this.isProcessing = true;
    this.errorMessage = '';
    
    try {
      // Create payment intent
      const paymentIntentSub = this.stripeService.createPaymentIntent(
        this.paymentData.amount,
        this.paymentData.currency,
        this.paymentData.metadata
      ).subscribe({
        next: async (paymentIntent) => {
          try {
            // Confirm payment with card
            const result = await this.stripeService.confirmCardPayment(
              paymentIntent.client_secret,
              this.cardElement!
            );
            
            if (result.error) {
              this.handlePaymentError(result.error?.message || 'Payment failed');
            } else {
              this.handlePaymentSuccess(result.paymentIntent.id);
            }
          } catch {
            this.handlePaymentError('Payment confirmation failed');
          }
        },
        error: () => {
          this.handlePaymentError('Failed to create payment intent');
        }
      });
      
      this.subscriptions.push(paymentIntentSub);
      
    } catch {
      this.handlePaymentError('Payment processing failed');
    }
  }
  
  private handlePaymentSuccess(paymentIntentId: string): void {
    this.isProcessing = false;
    const result: PaymentResult = {
      success: true,
      paymentIntentId
    };
    this.paymentSuccess.emit(result);
  }
  
  private handlePaymentError(error: string): void {
    this.isProcessing = false;
    this.errorMessage = error;
    const result: PaymentResult = {
      success: false,
      error
    };
    this.paymentError.emit(result);
  }
  
  private destroyCardElement(): void {
    if (this.cardElement) {
      this.cardElement.destroy();
      this.cardElement = null;
    }
  }
  
  resetForm(): void {
    this.paymentForm.reset();
    this.errorMessage = '';
    this.cardValid = false;
    this.destroyCardElement();
    if (this.stripeLoaded) {
      this.initializeCardElement();
    }
  }
  
  get formattedAmount(): string {
    return (this.paymentData.amount / 100).toFixed(2);
  }
  
  get canSubmit(): boolean {
    return !this.isProcessing && this.paymentForm.valid && this.cardValid && !this.disabled;
  }
}