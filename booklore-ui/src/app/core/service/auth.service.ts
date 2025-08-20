import {inject, Injectable, Injector} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import {Observable, tap} from 'rxjs';
import {SocketIOService} from '../../shared/websocket/socket-io.service';
import {API_CONFIG} from '../../config/api-config';
import {OAuthService} from 'angular-oauth2-oidc';
import {Router} from '@angular/router';
import {UserService} from '../../settings/user-management/user.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private apiUrl = `${API_CONFIG.BASE_URL}/api/v1/auth`;
  private socketIOService?: SocketIOService;

  private http = inject(HttpClient);
  private injector = inject(Injector);
  private oAuthService = inject(OAuthService);
  private router = inject(Router);
  private userService = inject(UserService);

  internalLogin(credentials: { username: string; password: string }): Observable<{ data: { access_token: string; refresh_token: string }, isDefaultPassword: string }> {
    // Map username to email for backend compatibility
    const loginPayload = {
      email: credentials.username,
      password: credentials.password
    };
    return this.http.post<{ data: { access_token: string; refresh_token: string }, isDefaultPassword: string }>(`${this.apiUrl}/login`, loginPayload).pipe(
      tap((response) => {
        if (response.data?.access_token && response.data?.refresh_token) {
          this.saveInternalTokens(response.data.access_token, response.data.refresh_token);
          this.initializeWebSocketConnection();
          // 登录成功后加载用户信息
          this.userService.loadCurrentUser();
        }
      })
    );
  }

  internalRefreshToken(): Observable<{ data: { access_token: string; refresh_token: string } }> {
    const refreshToken = this.getInternalRefreshToken();
    return this.http.post<{ data: { access_token: string; refresh_token: string } }>(`${this.apiUrl}/refresh`, {refreshToken}).pipe(
      tap((response) => {
        if (response.data?.access_token && response.data?.refresh_token) {
          this.saveInternalTokens(response.data.access_token, response.data.refresh_token);
        }
      })
    );
  }

  remoteLogin(): Observable<{ data: { access_token: string; refresh_token: string }, isDefaultPassword: string }> {
    return this.http.get<{ data: { access_token: string; refresh_token: string }, isDefaultPassword: string }>(`${this.apiUrl}/remote`).pipe(
      tap((response) => {
        if (response.data?.access_token && response.data?.refresh_token) {
          this.saveInternalTokens(response.data.access_token, response.data.refresh_token);
          this.initializeWebSocketConnection();
          // 登录成功后加载用户信息
          this.userService.loadCurrentUser();
        }
      })
    );
  }

  saveInternalTokens(accessToken: string, refreshToken: string): void {
    localStorage.setItem('accessToken_Internal', accessToken);
    localStorage.setItem('refreshToken_Internal', refreshToken);
  }

  getInternalAccessToken(): string | null {
    return localStorage.getItem('accessToken_Internal');
  }

  getOidcAccessToken(): string | null {
    return this.oAuthService.getIdToken();
  }

  getInternalRefreshToken(): string | null {
    return localStorage.getItem('refreshToken_Internal');
  }

  logout(): void {
    localStorage.removeItem('accessToken_Internal');
    localStorage.removeItem('refreshToken_Internal');
    this.getSocketIOService().deactivate();
    if (this.oAuthService.clientId) {
      this.oAuthService.logOut();
    } else {
      this.router.navigate(['/login']);
    }
  }

  getSocketIOService(): SocketIOService {
    if (!this.socketIOService) {
      this.socketIOService = this.injector.get(SocketIOService);
    }
    return this.socketIOService;
  }

  initializeWebSocketConnection(): void {
    const token = this.getOidcAccessToken() || this.getInternalAccessToken();
    if (!token) return;

    const socketService = this.getSocketIOService();
    socketService.activate();
  }
}

export function websocketInitializer(authService: AuthService): () => void {
  return () => authService.initializeWebSocketConnection();
}
