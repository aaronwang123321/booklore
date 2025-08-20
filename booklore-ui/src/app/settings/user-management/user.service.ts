import {inject, Injectable, Injector} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {BehaviorSubject, Observable, throwError} from 'rxjs';
import {API_CONFIG} from '../../config/api-config';
import {SocketIOService} from '../../shared/websocket/socket-io.service';
import {Library} from '../../book/model/library.model';
import {catchError, map} from 'rxjs/operators';
import {CbxPageSpread, CbxPageViewMode, PdfPageSpread, PdfPageViewMode} from '../../book/model/book.model';

export interface EntityViewPreferences {
  global: EntityViewPreference;
  overrides: EntityViewPreferenceOverride[];
}

export interface EntityViewPreference {
  sortKey: string;
  sortDir: 'ASC' | 'DESC';
  view: 'GRID' | 'TABLE';
  coverSize: number;
  seriesCollapsed: boolean;
}

export interface EntityViewPreferenceOverride {
  entityType: 'LIBRARY' | 'SHELF';
  entityId: number;
  preferences: EntityViewPreference;
}

export interface SidebarLibrarySorting {
  field: string;
  order: string;
}

export interface SidebarShelfSorting {
  field: string;
  order: string;
}

export interface PerBookSetting {
  pdf: string;
  epub: string;
  cbx: string;
}

export type PageSpread = 'off' | 'even' | 'odd';

export interface PdfReaderSetting {
  pageSpread: PageSpread;
  pageZoom: string;
  showSidebar: boolean;
}

export interface EpubReaderSetting {
  theme: string;
  font: string;
  fontSize: number;
  flow: string;
  lineHeight: number;
  margin: number;
  letterSpacing: number;
}

export interface CbxReaderSetting {
  pageSpread: CbxPageSpread;
  pageViewMode: CbxPageViewMode;
}

export interface NewPdfReaderSetting {
  pageSpread: PdfPageSpread;
  pageViewMode: PdfPageViewMode;
}

export interface TableColumnPreference {
  field: string;
  visible: boolean;
  order: number;
}

export interface UserSettings {
  perBookSetting: PerBookSetting;
  pdfReaderSetting: PdfReaderSetting;
  epubReaderSetting: EpubReaderSetting;
  cbxReaderSetting: CbxReaderSetting;
  newPdfReaderSetting: NewPdfReaderSetting;
  sidebarLibrarySorting: SidebarLibrarySorting;
  sidebarShelfSorting: SidebarShelfSorting;
  filterSortingMode: 'alphabetical' | 'count';
  metadataCenterViewMode: 'route' | 'dialog';
  entityViewPreferences: EntityViewPreferences;
  tableColumnPreference?: TableColumnPreference[];
}

export interface User {
  id: number;
  username: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
  assignedLibraries: Library[];
  userSettings: UserSettings;
  provisioningMethod?: 'LOCAL' | 'OIDC' | 'REMOTE';
}

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly apiUrl = `${API_CONFIG.BASE_URL}/api/v1/auth/register`;
  private readonly userUrl = `${API_CONFIG.BASE_URL}/api/v1/users`;

  private http = inject(HttpClient);
  private injector = inject(Injector);

  private socketIOService?: SocketIOService;

  private userStateSubject = new BehaviorSubject<User | null>(null);
  userState$ = this.userStateSubject.asObservable();

  constructor() {
    // 不在构造函数中自动调用 getMyself()，避免在用户未认证时产生 401 错误
    // 改为在用户登录后由 AuthService 或其他组件主动调用 loadCurrentUser()
  }

  getCurrentUser(): User | null {
    return this.userStateSubject.getValue();
  }

  /**
   * 手动加载当前用户信息，应在用户认证后调用
   */
  loadCurrentUser(): void {
    this.getMyself().subscribe({
      next: user => {
        this.userStateSubject.next(user);
        this.startWebSocket();
      },
      error: err => {
        console.warn('Failed to load current user:', err);
        this.userStateSubject.next(null);
      }
    });
  }

  getMyself(): Observable<User> {
    interface AuthProfileResponse {
      success: boolean;
      data: {
        id: number;
        email: string;
        name: string;
        role: 'ADMIN' | 'USER';
        isActive: boolean;
        emailVerified: boolean;
        avatar?: string;
        stripeCustomerId?: string;
        createdAt: string;
        updatedAt: string;
      };
    }

    return this.http.get<AuthProfileResponse>(`${API_CONFIG.BASE_URL}/api/v1/auth/profile`).pipe(
      catchError(error => {
        console.error('Failed to get user profile:', error);
        return throwError(() => error);
      }),
      // 转换API响应格式到User接口
      map((response: AuthProfileResponse) => {
        if (response.success && response.data) {
          return {
            id: response.data.id,
            username: response.data.email, // 使用email作为username
            name: response.data.name,
            email: response.data.email,
            role: response.data.role,
            assignedLibraries: [], // 默认空数组，可能需要从其他API获取
            userSettings: {} as UserSettings // 默认空对象，可能需要从其他API获取
          } as User;
        }
        throw new Error('Invalid response format');
      })
    );
  }

  createUser(userData: Omit<User, 'id'>): Observable<void> {
    return this.http.post<void>(this.apiUrl, userData);
  }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.userUrl);
  }

  updateUser(userId: number, updateData: Partial<User>): Observable<User> {
    return this.http.put<User>(`${this.userUrl}/${userId}`, updateData);
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.userUrl}/${userId}`);
  }

  changeUserPassword(userId: number, newPassword: string): Observable<void> {
    const payload = {
      userId: userId,
      newPassword: newPassword
    };
    return this.http.put<void>(`${this.userUrl}/change-user-password`, payload).pipe(
      catchError((error) => {
        const errorMessage = error?.error?.message || 'An unexpected error occurred. Please try again.';
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    const payload = {
      currentPassword: currentPassword,
      newPassword: newPassword
    };
    return this.http.put<void>(`${this.userUrl}/change-password`, payload).pipe(
      catchError((error) => {
        const errorMessage = error?.error?.message || 'An unexpected error occurred. Please try again.';
        return throwError(() => new Error(errorMessage));
      })
    );
  }

  updateUserSetting(userId: number, key: string, value: unknown): void {
    const payload = {
      key,
      value
    };
    this.http.put<void>(`${this.userUrl}/${userId}/settings`, payload, {
      headers: {'Content-Type': 'application/json'},
      responseType: 'text' as 'json'
    }).subscribe(() => {
      const currentUser = this.userStateSubject.getValue();
      if (currentUser) {
        const updatedSettings = {...currentUser.userSettings, [key]: value};
        const updatedUser = {...currentUser, settings: updatedSettings};
        this.userStateSubject.next(updatedUser);
      }
    });
  }

  private startWebSocket(): void {
    const token = this.getToken();
    if (token) {
      const socketIOService = this.getSocketIOService();
      socketIOService.activate();
    }
  }

  private getSocketIOService(): SocketIOService {
    if (!this.socketIOService) {
      this.socketIOService = this.injector.get(SocketIOService);
    }
    return this.socketIOService;
  }

  getToken(): string | null {
    return localStorage.getItem('accessToken');
  }
}
