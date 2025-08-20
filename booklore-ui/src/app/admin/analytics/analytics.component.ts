import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Card } from 'primeng/card';
import { Button } from 'primeng/button';
import { UIChart } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { Tag } from 'primeng/tag';
import { DropdownModule } from 'primeng/dropdown';
import { Calendar } from 'primeng/calendar';
import { TabView, TabPanel } from 'primeng/tabview';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { API_CONFIG } from '../../config/api-config';
import { UserService } from '../../settings/user-management/user.service';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

export interface UserAnalytics {
  totalUsers: number;
  activeUsers: number;
  newUsersThisMonth: number;
  userGrowthRate: number;
  userActivityByHour: { hour: number; count: number }[];
  usersByRole: { role: string; count: number }[];
  topActiveUsers: { userId: string; userName: string; activityCount: number }[];
}

export interface BookAnalytics {
  totalBooks: number;
  booksAddedThisMonth: number;
  mostPopularBooks: { bookId: string; title: string; readCount: number }[];
  booksByGenre: { genre: string; count: number }[];
  booksByLanguage: { language: string; count: number }[];
  averageRating: number;
  totalRatings: number;
}

export interface ReadingAnalytics {
  totalReadingSessions: number;
  averageReadingTime: number;
  readingTrendsByDay: { date: string; sessions: number; duration: number }[];
  readingByTimeOfDay: { hour: number; sessions: number }[];
  completionRate: number;
  mostActiveReadingDays: string[];
}

export interface LibraryAnalytics {
  totalLibraries: number;
  averageBooksPerLibrary: number;
  libraryUsageStats: { libraryId: string; name: string; bookCount: number; userCount: number }[];
  storageUsage: { libraryId: string; name: string; sizeBytes: number }[];
}

export interface SystemAnalytics {
  apiCallsToday: number;
  errorRate: number;
  averageResponseTime: number;
  peakUsageHours: { hour: number; requests: number }[];
  systemUptime: number;
  databaseQueries: number;
}

@Component({
  selector: 'app-analytics',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    Card,
    Button,
    UIChart,
    TableModule,
    Tag,
    DropdownModule,
    Calendar,
    TabView,
    TabPanel
  ],
  templateUrl: './analytics.component.html',
  styleUrls: ['./analytics.component.scss']
})
export class AnalyticsComponent implements OnInit {
  private http = inject(HttpClient);
  private userService = inject(UserService);
  private router = inject(Router);
  
  userAnalytics$: Observable<UserAnalytics> | undefined;
  bookAnalytics$: Observable<BookAnalytics> | undefined;
  readingAnalytics$: Observable<ReadingAnalytics> | undefined;
  libraryAnalytics$: Observable<LibraryAnalytics> | undefined;
  systemAnalytics$: Observable<SystemAnalytics> | undefined;
  
  // 时间范围选择
  timeRangeOptions = [
    { label: '最近7天', value: '7d' },
    { label: '最近30天', value: '30d' },
    { label: '最近90天', value: '90d' },
    { label: '最近一年', value: '1y' },
    { label: '自定义', value: 'custom' }
  ];
  
  selectedTimeRange = '30d';
  customDateRange: Date[] = [];
  
  // 图表数据
  userGrowthChartData: object = {};
  userGrowthChartOptions: object = {};
  
  userActivityChartData: object = {};
  userActivityChartOptions: object = {};
  
  bookGenreChartData: object = {};
  bookGenreChartOptions: object = {};
  
  readingTrendsChartData: object = {};
  readingTrendsChartOptions: object = {};
  
  systemPerformanceChartData: object = {};
  systemPerformanceChartOptions: object = {};

  // 峰值使用时间图表数据
  peakUsageChartData: object = {};
  peakUsageChartOptions: object = {};
  
  ngOnInit(): void {
    // 检查管理员权限
    this.userService.userState$.subscribe(userData => {
      if (userData && userData.role !== 'ADMIN') {
        this.router.navigate(['/dashboard']);
        return;
      }
    });
    
    this.loadAnalyticsData();
    this.initializeCharts();
  }
  
  private loadAnalyticsData(): void {
    const params = this.getTimeRangeParams();
    
    this.userAnalytics$ = this.http.get<UserAnalytics>(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/users`, { params });
    this.bookAnalytics$ = this.http.get<BookAnalytics>(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/books`, { params });
    this.readingAnalytics$ = this.http.get<ReadingAnalytics>(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/reading`, { params });
    this.libraryAnalytics$ = this.http.get<LibraryAnalytics>(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/libraries`, { params });
    this.systemAnalytics$ = this.http.get<SystemAnalytics>(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/system`, { params });
  }
  
  private getTimeRangeParams(): Record<string, string> {
    if (this.selectedTimeRange === 'custom' && this.customDateRange.length === 2) {
      return {
        startDate: this.customDateRange[0].toISOString(),
        endDate: this.customDateRange[1].toISOString()
      };
    }
    
    return { timeRange: this.selectedTimeRange };
  }
  
  private initializeCharts(): void {
    // 用户增长图表
    this.userGrowthChartData = {
      labels: [],
      datasets: [{
        label: '新用户',
        data: [],
        borderColor: '#42A5F5',
        backgroundColor: 'rgba(66, 165, 245, 0.1)',
        fill: true,
        tension: 0.4
      }]
    };
    
    this.userGrowthChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: '用户增长趋势'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };
    
    // 用户活动图表
    this.userActivityChartData = {
      labels: Array.from({ length: 24 }, (_, i) => `${i}:00`),
      datasets: [{
        label: '活跃用户数',
        data: [],
        backgroundColor: 'rgba(75, 192, 192, 0.6)',
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1
      }]
    };
    
    this.userActivityChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: '用户活动时间分布'
        }
      },
      scales: {
        y: {
          beginAtZero: true
        }
      }
    };
    
    // 书籍类型分布图表
    this.bookGenreChartData = {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
          '#FF6384',
          '#C9CBCF'
        ]
      }]
    };
    
    this.bookGenreChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right'
        },
        title: {
          display: true,
          text: '书籍类型分布'
        }
      }
    };
    
    // 阅读趋势图表
    this.readingTrendsChartData = {
      labels: [],
      datasets: [
        {
          label: '阅读会话数',
          data: [],
          borderColor: '#FF6384',
          backgroundColor: 'rgba(255, 99, 132, 0.1)',
          yAxisID: 'y'
        },
        {
          label: '阅读时长(分钟)',
          data: [],
          borderColor: '#36A2EB',
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          yAxisID: 'y1'
        }
      ]
    };
    
    this.readingTrendsChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: '阅读趋势分析'
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: '日期'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: '会话数'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '时长(分钟)'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    };
    
    // 系统性能图表
    this.systemPerformanceChartData = {
      labels: [],
      datasets: [
        {
          label: 'API调用数',
          data: [],
          borderColor: '#4BC0C0',
          backgroundColor: 'rgba(75, 192, 192, 0.1)',
          yAxisID: 'y'
        },
        {
          label: '平均响应时间(ms)',
          data: [],
          borderColor: '#FFCE56',
          backgroundColor: 'rgba(255, 206, 86, 0.1)',
          yAxisID: 'y1'
        }
      ]
    };
    
    this.systemPerformanceChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          position: 'top'
        },
        title: {
          display: true,
          text: '系统性能监控'
        }
      },
      scales: {
        x: {
          display: true,
          title: {
            display: true,
            text: '时间'
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'API调用数'
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: '响应时间(ms)'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    };
  }
  
  onTimeRangeChange(): void {
    this.loadAnalyticsData();
  }
  
  onCustomDateRangeChange(): void {
    if (this.selectedTimeRange === 'custom' && this.customDateRange.length === 2) {
      this.loadAnalyticsData();
    }
  }
  
  exportAnalyticsData(): void {
    const params = this.getTimeRangeParams();
    
    this.http.get(`${API_CONFIG.BASE_URL}/api/v1/admin/analytics/export`, { 
      params,
      responseType: 'blob'
    }).subscribe((blob: Blob) => {
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `analytics-report-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
    });
  }
  
  refreshData(): void {
    this.loadAnalyticsData();
  }
  
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  formatDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    
    if (hours > 0) {
      return `${hours}小时${mins}分钟`;
    } else {
      return `${mins}分钟`;
    }
  }
  
  formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    
    if (days > 0) {
      return `${days}天${hours}小时`;
    } else {
      return `${hours}小时`;
    }
  }

  getPeakUsageChartData(systemStats: SystemAnalytics | null): object {
    if (!systemStats?.peakUsageHours) {
      return { labels: [], datasets: [] };
    }
    return {
      labels: systemStats.peakUsageHours.map(item => `${item.hour}:00`),
      datasets: [{
        label: '请求数',
        data: systemStats.peakUsageHours.map(item => item.requests),
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1
      }]
    };
  }

  getUserRoleChartData(userStats: UserAnalytics | null): object {
    if (!userStats?.usersByRole) {
      return { labels: [], datasets: [] };
    }
    return {
      labels: userStats.usersByRole.map(item => item.role),
      datasets: [{
        label: '用户数',
        data: userStats.usersByRole.map(item => item.count),
        backgroundColor: [
          'rgba(255, 99, 132, 0.2)',
          'rgba(54, 162, 235, 0.2)',
          'rgba(255, 205, 86, 0.2)',
          'rgba(75, 192, 192, 0.2)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 205, 86, 1)',
          'rgba(75, 192, 192, 1)'
        ],
        borderWidth: 1
      }]
    };
  }

  getReadingTimeChartData(readingStats: ReadingAnalytics): object {
    if (!readingStats?.readingByTimeOfDay) {
      return {
        labels: [],
        datasets: [{
          label: '阅读会话数',
          data: [],
          backgroundColor: 'rgba(255, 99, 132, 0.6)'
        }]
      };
    }

    return {
      labels: readingStats.readingByTimeOfDay.map(item => item.hour + ':00'),
      datasets: [{
        label: '阅读会话数',
        data: readingStats.readingByTimeOfDay.map(item => item.sessions),
        backgroundColor: 'rgba(255, 99, 132, 0.6)'
      }]
    };
  }

  getBookLanguageChartData(bookStats: BookAnalytics): object {
    if (!bookStats?.booksByLanguage) {
      return {
        labels: [],
        datasets: [{
          label: '书籍数量',
          data: [],
          backgroundColor: 'rgba(54, 162, 235, 0.6)'
        }]
      };
    }

    return {
      labels: bookStats.booksByLanguage.map(item => item.language),
      datasets: [{
        label: '书籍数量',
        data: bookStats.booksByLanguage.map(item => item.count),
        backgroundColor: 'rgba(54, 162, 235, 0.6)'
      }]
    };
  }

  getBookGenreChartData(bookStats: BookAnalytics): object {
    if (!bookStats?.booksByGenre) {
      return {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']
        }]
      };
    }

    return {
      labels: bookStats.booksByGenre.map(item => item.genre),
      datasets: [{
        data: bookStats.booksByGenre.map(item => item.count),
        backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40']
      }]
    };
  }
}