import {inject} from '@angular/core';
import {OAuthService} from 'angular-oauth2-oidc';
import {Subscription} from 'rxjs';
import {AppSettingsService} from './core/service/app-settings.service';
import {AuthService, websocketInitializer} from './core/service/auth.service';
import {AuthInitializationService} from './auth-initialization-service';
import {UserService} from './settings/user-management/user.service';

export function initializeAuthFactory() {
  return () => {
    const oauthService = inject(OAuthService);
    const appSettingsService = inject(AppSettingsService);
    const authService = inject(AuthService);
    const authInitService = inject(AuthInitializationService);
    const userService = inject(UserService);

    // Load app settings first
    appSettingsService.loadAppSettings();

    return new Promise<void>((resolve) => {
      let sub: Subscription | null = null;
      
      sub = appSettingsService.appSettings$.subscribe(settings => {
        if (!settings) {
          // If settings failed to load, continue with default behavior
          console.warn('[Auth Init] App settings failed to load, continuing with default configuration');
          if (sub) sub.unsubscribe();
          authInitService.markAsInitialized();
          resolve();
          return;
        }

        if (sub) sub.unsubscribe();

        if (settings.oidcEnabled && settings.oidcProviderDetails) {
          const details = settings.oidcProviderDetails;

          oauthService.configure({
            issuer: details.issuerUri,
            clientId: details.clientId,
            scope: 'openid profile email offline_access',
            redirectUri: window.location.origin + '/oauth2-callback',
            responseType: 'code',
            showDebugInformation: false,
            requireHttps: false,
            strictDiscoveryDocumentValidation: false,
          });

          oauthService.loadDiscoveryDocumentAndTryLogin()
            .then(() => {
              if (oauthService.hasValidAccessToken()) {
                console.log('[OIDC] Valid access token found');
                oauthService.setupAutomaticSilentRefresh();
                websocketInitializer(authService);
              } else {
                console.warn('[OIDC] No valid access token. Will proceed to app and show login page.');
              }
            })
            .catch(err => {
              console.error('[OIDC] Failed to load discovery document or login:', err);
              authInitService.setOidcFailed(true);
            })
            .finally(() => {
              authInitService.markAsInitialized();
              resolve();
            });

        } else if (settings.remoteAuthEnabled) {
          if (sub) sub.unsubscribe();
          authService.remoteLogin().subscribe({
            next: () => {
              authInitService.markAsInitialized();
              resolve();
            },
            error: err => {
              console.error('[Remote Login] failed:', err);
              authInitService.markAsInitialized();
              resolve();
            }
          });

        } else {
          // 检查是否有本地存储的内部认证token
          const internalToken = authService.getInternalAccessToken();
          
          if (internalToken) {
            console.log('[Auth Init] Found internal access token, loading user profile');
            // 有token，尝试加载用户信息
            userService.loadCurrentUser();
            // 初始化WebSocket连接
            authService.initializeWebSocketConnection();
          }
          
          if (sub) sub.unsubscribe();
          authInitService.markAsInitialized();
          resolve();
        }
      });
    });
  };
}
