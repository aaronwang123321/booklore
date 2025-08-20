import { Component, inject, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { ProgressBar } from 'primeng/progressbar';
import { TabView, TabPanel } from 'primeng/tabview';
import { Observable, interval, Subscription } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG } from '../../config/api-config';
import { UserService } from '../../settings/user-management/user.service';
import { Router } from '@angular/router';

export interface SystemMetrics {
  cpu: {
    usage: number;
    cores: number;
    temperature?: number;
  };
  memory: {
    used: number;
    total: number;
    usage: number;
  };
  disk: {
    used: number;
    total: number;
    usage: number;
  };
  network: {
    bytesIn: number;
    bytesOut: number;
    packetsIn: number;
    packetsOut: number;
  };
}

export interface DatabaseStatus {
  status: 'connected' | 'disconnected' | 'error';
  connectionCount: number;
  queryCount: number;
  avgResponseTime: number;
  lastBackup?: string;
  size: number;
}

export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error';
  uptime: number;
  memoryUsage: number;
  cpuUsage: number;
  port?: number;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  service: string;
  message: string;
  details?: string;
}

@Component({
  selector: 'app-system-monitoring',
  standalone: true,
  imports: [
    CommonModule,
    Card,
    Button,
    UIChart,
    TableModule,
    Tag,
    ProgressBar,
    TabView,
    TabPanel
  ],
  templateUrl: './system-monitoring.component.html',
  styleUrls: ['./system-monitoring.component.scss']
})
export class SystemMonitoringComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private userService = inject(UserService);
  private router = inject(Router);
  
  private refreshSubscription?: Subscription;
  
  systemMetrics$: Observable<SystemMetrics> | undefined;
  databaseStatus$: Observable<DatabaseStatus> | undefined;
  serviceStatuses$: Observable<ServiceStatus[]> | undefined;
  systemLogs$: Observable<SystemLog[]> | undefined;
  
  // 图表数据
  cpuChartData: object = {};
  cpuChartOptions: object = {};
  
  memoryChartData: object = {};
  memoryChartOptions: object = {};
  
  networkChartData: object = {};
  networkChartOptions: object = {};
  
  // 实时数据
  isRealTimeEnabled = false;
  refreshInterval = 5000; // 5秒
  
  ngOnInit(): void {
    // 检查管理员权限
    this.userService.userState$.subscribe(userData => {
      if (userData && userData.role !== 'ADMIN') {
        this.router.navigate(['/dashboard']);
        return;
      }
    });
    
    this.loadMonitoringData();
    this.initializeCharts();
  }
  
  ngOnDestroy(): void {
    this.stopRealTimeMonitoring();
  }
  
  private loadMonitoringData(): void {
    this.systemMetrics$ = this.http.get<SystemMetrics>(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/system`);
    this.databaseStatus$ = this.http.get<DatabaseStatus>(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/database`);
    this.serviceStatuses$ = this.http.get<ServiceStatus[]>(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/services`);
    this.systemLogs$ = this.http.get<SystemLog[]>(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/logs`);
  }
  
  private initializeCharts(): void {
    // CPU使用率图表
    this.cpuChartData = {
      labels: ['已使用', '空闲'],
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#FF6384', '#36A2EB'],
        hoverBackgroundColor: ['#FF6384', '#36A2EB']
      }]
    };
    
    this.cpuChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        },
        title: {
          display: true,
          text: 'CPU使用率'
        }
      }
    };
    
    // 内存使用率图表
    this.memoryChartData = {
      labels: ['已使用', '可用'],
      datasets: [{
        data: [0, 100],
        backgroundColor: ['#FFCE56', '#4BC0C0'],
        hoverBackgroundColor: ['#FFCE56', '#4BC0C0']
      }]
    };
    
    this.memoryChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        },
        title: {
          display: true,
          text: '内存使用率'
        }
      }
    };
    
    // 网络流量图表
    this.networkChartData = {
      labels: ['入站', '出站'],
      datasets: [{
        label: '网络流量 (MB)',
        data: [0, 0],
        backgroundColor: ['#9966FF', '#FF9F40'],
        borderColor: ['#9966FF', '#FF9F40'],
        borderWidth: 1
      }]
    };
    
    this.networkChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom'
        },
        title: {
          display: true,
          text: '网络流量'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };
  }
  
  toggleRealTimeMonitoring(): void {
    if (this.isRealTimeEnabled) {
      this.stopRealTimeMonitoring();
    } else {
      this.startRealTimeMonitoring();
    }
  }
  
  private startRealTimeMonitoring(): void {
    this.isRealTimeEnabled = true;
    this.refreshSubscription = interval(this.refreshInterval).subscribe(() => {
      this.loadMonitoringData();
    });
  }
  
  private stopRealTimeMonitoring(): void {
    this.isRealTimeEnabled = false;
    if (this.refreshSubscription) {
      this.refreshSubscription.unsubscribe();
      this.refreshSubscription = undefined;
    }
  }
  
  refreshData(): void {
    this.loadMonitoringData();
  }
  
  restartService(serviceName: string): void {
    this.http.post(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/services/${serviceName}/restart`, {})
      .subscribe(() => {
        // 延迟刷新以等待服务重启
        setTimeout(() => {
          this.loadMonitoringData();
        }, 2000);
      });
  }
  
  clearLogs(): void {
    this.http.delete(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/logs`)
      .subscribe(() => {
        this.loadMonitoringData();
      });
  }
  
  exportLogs(): void {
    this.http.get(`${API_CONFIG.BASE_URL}/api/v1/admin/monitoring/logs/export`, { responseType: 'blob' })
      .subscribe((blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `system-logs-${new Date().toISOString().split('T')[0]}.txt`;
        link.click();
        window.URL.revokeObjectURL(url);
      });
  }
  
  getServiceStatusSeverity(status: string): string {
    switch (status) {
      case 'running':
        return 'success';
      case 'stopped':
        return 'warning';
      case 'error':
        return 'danger';
      default:
        return 'info';
    }
  }
  
  getLogLevelSeverity(level: string): string {
    switch (level) {
      case 'error':
        return 'danger';
      case 'warning':
        return 'warning';
      case 'info':
        return 'info';
      case 'debug':
        return 'secondary';
      default:
        return 'info';
    }
  }
  
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (days > 0) {
      return `${days}天 ${hours}小时`;
    } else if (hours > 0) {
      return `${hours}小时 ${minutes}分钟`;
    } else {
      return `${minutes}分钟`;
    }
  }
}