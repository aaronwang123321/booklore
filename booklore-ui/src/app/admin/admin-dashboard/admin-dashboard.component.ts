import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProgressBar } from 'primeng/progressbar';
import { Observable } from 'rxjs';
import { UserService } from '../../settings/user-management/user.service';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG } from '../../config/api-config';

export interface DashboardOverview {
  totalUsers: number;
  totalBooks: number;
  totalLibraries: number;
  activeSubscriptions: number;
  systemHealth: {
    status: 'healthy' | 'warning' | 'critical';
    uptime: string;
    memoryUsage: number;
    diskUsage: number;
  };
  recentActivity: {
    timestamp: Date;
    userName: string;
    action: string;
    details: string;
  }[];
}

export interface SystemAlert {
  id: string;
  type: 'info' | 'warning' | 'error';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    Card,
    Button,
    UIChart,
    TableModule,
    Tag,
    ProgressBar
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private userService = inject(UserService);
  private router = inject(Router);

  dashboardData$: Observable<DashboardOverview> | undefined;
  systemAlerts$: Observable<SystemAlert[]> | undefined;
  
  userActivityChartData: object = {};
  userActivityChartOptions: object = {};
  
  systemHealthChartData: object = {};
  systemHealthChartOptions: object = {};

  ngOnInit(): void {
    // 检查管理员权限
    this.userService.userState$.subscribe(userData => {
      if (userData && userData.role !== 'ADMIN') {
        this.router.navigate(['/dashboard']);
        return;
      }
    });

    this.loadDashboardData();
    this.initializeCharts();
  }

  private loadDashboardData(): void {
    this.dashboardData$ = this.http.get<DashboardOverview>(`${API_CONFIG.BASE_URL}/api/v1/admin/dashboard/overview`);
    this.systemAlerts$ = this.http.get<SystemAlert[]>(`${API_CONFIG.BASE_URL}/api/v1/admin/dashboard/alerts`);
  }

  private initializeCharts(): void {
    // 用户活动图表
    this.userActivityChartData = {
      labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      datasets: [
        {
          label: 'Active Users',
          data: [65, 59, 80, 81, 56, 55, 40],
          fill: false,
          borderColor: '#42A5F5',
          tension: 0.4
        },
        {
          label: 'New Registrations',
          data: [28, 48, 40, 19, 86, 27, 90],
          fill: false,
          borderColor: '#FFA726',
          tension: 0.4
        }
      ]
    };

    this.userActivityChartOptions = {
      plugins: {
        legend: {
          labels: {
            color: '#495057'
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          }
        },
        y: {
          ticks: {
            color: '#495057'
          },
          grid: {
            color: '#ebedef'
          }
        }
      }
    };

    // 系统健康图表
    this.systemHealthChartData = {
      labels: ['CPU', 'Memory', 'Disk', 'Network'],
      datasets: [
        {
          data: [75, 60, 45, 80],
          backgroundColor: [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0'
          ]
        }
      ]
    };

    this.systemHealthChartOptions = {
      plugins: {
        legend: {
          labels: {
            color: '#495057'
          }
        }
      }
    };
  }

  acknowledgeAlert(alertId: string): void {
    this.http.post(`${API_CONFIG.BASE_URL}/api/v1/admin/dashboard/alerts/${alertId}/acknowledge`, {}).subscribe(() => {
      this.loadDashboardData();
    });
  }

  exportDashboardData(): void {
    this.http.get(`${API_CONFIG.BASE_URL}/api/v1/admin/dashboard/export`).subscribe((data: unknown) => {
      // 处理导出逻辑
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dashboard-export-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }

  navigateToUserManagement(): void {
    this.router.navigate(['/settings'], { queryParams: { tab: 'user-management' } });
  }

  navigateToSystemMonitor(): void {
    this.router.navigate(['/admin/system-monitor']);
  }

  navigateToAnalytics(): void {
    this.router.navigate(['/admin/analytics']);
  }
}