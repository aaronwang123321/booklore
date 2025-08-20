import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { SubscriptionService, SubscriptionPlan, SubscriptionStatus } from '../../../services/subscription.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-subscription-plans',
  standalone: true,
  imports: [
    CommonModule
  ],
  template: `
    <div class="subscription-plans-container">
      <div class="header">
        <h2>选择订阅计划</h2>
        <p class="subtitle">选择最适合您需求的计划</p>
      </div>

      <div class="current-subscription" *ngIf="currentSubscription">
        <div class="current-plan-card">
          <div class="card-header">
            <h3>当前订阅</h3>
          </div>
          <div class="card-content">
            <div class="current-plan-info">
              <span class="plan-name">{{ currentSubscription.planName }}</span>
              <span class="plan-status" [class]="'status-' + currentSubscription.status">
                {{ getStatusText(currentSubscription.status) }}
              </span>
            </div>
            <p class="next-billing" *ngIf="currentSubscription.nextBillingDate">
              下次计费日期: {{ currentSubscription.nextBillingDate | date:'yyyy-MM-dd' }}
            </p>
          </div>
        </div>
      </div>

      <div class="plans-grid" *ngIf="!loading; else loadingTemplate">
        <div 
          *ngFor="let plan of plans" 
          class="plan-card"
          [class.popular]="plan.isPopular"
          [class.current]="isCurrentPlan(plan)"
        >
          <div class="popular-badge" *ngIf="plan.isPopular">
            <span class="star-icon">★</span>
            <span>推荐</span>
          </div>

          <div class="card-header">
            <h3>{{ plan.name }}</h3>
            <p class="card-subtitle">{{ plan.description }}</p>
          </div>

          <div class="card-content">
            <div class="price-section">
              <span class="price">¥{{ plan.price }}</span>
              <span class="interval">/{{ getIntervalText(plan.interval) }}</span>
            </div>

            <div class="features-list">
              <div class="feature" *ngFor="let feature of plan.features">
                <span class="feature-icon">✓</span>
                <span>{{ feature }}</span>
              </div>
            </div>
          </div>

          <div class="card-actions">
            <button 
              class="select-button"
              [class.primary]="plan.isPopular"
              [disabled]="isCurrentPlan(plan) || processing"
              (click)="selectPlan(plan)"
            >
              <span *ngIf="processing && selectedPlanId === plan.id" class="loading-icon">⏳</span>
              {{ getButtonText(plan) }}
            </button>
          </div>
        </div>
      </div>

      <ng-template #loadingTemplate>
        <div class="loading-container">
          <div class="spinner"></div>
          <p>加载订阅计划中...</p>
        </div>
      </ng-template>
    </div>
  `,
  styles: [`
    .subscription-plans-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 24px;
    }

    .header {
      text-align: center;
      margin-bottom: 32px;
    }

    .header h2 {
      margin: 0 0 8px 0;
      font-size: 2rem;
      font-weight: 500;
    }

    .subtitle {
      color: #666;
      font-size: 1.1rem;
      margin: 0;
    }

    .current-subscription {
      margin-bottom: 32px;
    }

    .current-plan-card {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border-radius: 8px;
      padding: 16px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .card-header {
      margin-bottom: 16px;
    }

    .card-header h3 {
      margin: 0 0 8px 0;
      font-size: 1.25rem;
      font-weight: 500;
    }

    .card-subtitle {
      margin: 0;
      opacity: 0.8;
      font-size: 0.875rem;
    }

    .card-content {
      margin-bottom: 16px;
    }

    .card-actions {
      margin-top: auto;
    }

    .current-plan-info {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .plan-name {
      font-size: 1.2rem;
      font-weight: 500;
    }

    .plan-status {
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .status-active {
      background-color: #4caf50;
      color: white;
    }

    .status-canceled {
      background-color: #f44336;
      color: white;
    }

    .status-past_due {
      background-color: #ff9800;
      color: white;
    }

    .next-billing {
      margin: 0;
      opacity: 0.9;
    }

    .plans-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    .plan-card {
      position: relative;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      height: fit-content;
      background: white;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      display: flex;
      flex-direction: column;
    }

    .plan-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    }

    .plan-card.popular {
      border: 2px solid #3f51b5;
      transform: scale(1.05);
    }

    .plan-card.current {
      border: 2px solid #4caf50;
      background-color: #f1f8e9;
    }

    .popular-badge {
      position: absolute;
      top: -12px;
      right: 16px;
      background: linear-gradient(135deg, #3f51b5, #5c6bc0);
      color: white;
      padding: 6px 12px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 0.875rem;
      font-weight: 500;
      z-index: 1;
    }

    .star-icon {
      font-size: 16px;
      color: #ffd700;
    }

    .price-section {
      text-align: center;
      margin: 16px 0 24px 0;
    }

    .price {
      font-size: 2.5rem;
      font-weight: 600;
      color: #3f51b5;
    }

    .interval {
      font-size: 1rem;
      color: #666;
      margin-left: 4px;
    }

    .features-list {
      margin: 16px 0;
    }

    .feature {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }

    .feature-icon {
      color: #4caf50;
      font-size: 16px;
      font-weight: bold;
      width: 20px;
      display: inline-block;
      text-align: center;
    }

    .select-button {
      width: 100%;
      height: 48px;
      font-size: 1rem;
      font-weight: 500;
      border: none;
      border-radius: 6px;
      background-color: #f5f5f5;
      color: #333;
      cursor: pointer;
      transition: background-color 0.2s ease;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }

    .select-button:hover:not(:disabled) {
      background-color: #e0e0e0;
    }

    .select-button.primary {
      background-color: #3f51b5;
      color: white;
    }

    .select-button.primary:hover:not(:disabled) {
      background-color: #303f9f;
    }

    .select-button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .loading-icon {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px 0;
      gap: 16px;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #3f51b5;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @media (max-width: 768px) {
      .subscription-plans-container {
        padding: 16px;
      }

      .plans-grid {
        grid-template-columns: 1fr;
        gap: 16px;
      }

      .plan-card.popular {
        transform: none;
      }

      .header h2 {
        font-size: 1.5rem;
      }
    }
  `]
})
export class SubscriptionPlansComponent implements OnInit {
  plans: SubscriptionPlan[] = [];
  currentSubscription: SubscriptionStatus | null = null;
  loading = true;
  processing = false;
  selectedPlanId: string | null = null;

  constructor(
    private subscriptionService: SubscriptionService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading = true;
    
    // 并行加载计划和当前订阅状态
    Promise.all([
      this.subscriptionService.getPlans().toPromise(),
      this.subscriptionService.getSubscriptionStatus().toPromise()
    ]).then(([plansResponse, statusResponse]) => {
      if (plansResponse?.success) {
        this.plans = plansResponse.data;
      }
      
      if (statusResponse?.success && statusResponse.data) {
        this.currentSubscription = statusResponse.data;
      }
      
      this.loading = false;
    }).catch(error => {
      console.error('加载数据失败:', error);
      alert('加载数据失败，请稍后重试');
      this.loading = false;
    });
  }

  selectPlan(plan: SubscriptionPlan): void {
    if (this.isCurrentPlan(plan) || this.processing) {
      return;
    }

    this.processing = true;
    this.selectedPlanId = plan.id;

    const successUrl = `${window.location.origin}/subscription/success`;
    const cancelUrl = `${window.location.origin}/subscription/plans`;
    
    this.subscriptionService.createCheckoutSession(plan.id, successUrl, cancelUrl).subscribe({
      next: (response) => {
        if (response.success && response.data.url) {
          // 重定向到Stripe结账页面
          window.location.href = response.data.url;
        } else {
          alert('创建结账会话失败');
          this.processing = false;
          this.selectedPlanId = null;
        }
      },
      error: (error) => {
        console.error('创建结账会话失败:', error);
        alert('创建结账会话失败，请稍后重试');
        this.processing = false;
        this.selectedPlanId = null;
      }
    });
  }

  isCurrentPlan(plan: SubscriptionPlan): boolean {
    return this.currentSubscription?.planId === plan.id && 
           this.currentSubscription?.status === 'active';
  }

  getButtonText(plan: SubscriptionPlan): string {
    if (this.processing && this.selectedPlanId === plan.id) {
      return '处理中...';
    }
    
    if (this.isCurrentPlan(plan)) {
      return '当前计划';
    }
    
    if (this.currentSubscription?.status === 'active') {
      return '升级/降级';
    }
    
    return '选择计划';
  }

  getStatusText(status: string): string {
    const statusMap: Record<string, string> = {
      'active': '活跃',
      'canceled': '已取消',
      'past_due': '逾期',
      'unpaid': '未付款',
      'incomplete': '未完成'
    };
    return statusMap[status] || status;
  }

  getIntervalText(interval: string): string {
    const intervalMap: Record<string, string> = {
      'month': '月',
      'year': '年',
      'week': '周',
      'day': '日'
    };
    return intervalMap[interval] || interval;
  }
}