import {HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest} from '@angular/common/http';
import {inject} from '@angular/core';
import {Router} from '@angular/router';
import {catchError, filter, switchMap, take} from 'rxjs/operators';
import {BehaviorSubject, Observable, throwError} from 'rxjs';
import {AuthService} from './core/service/auth.service';
import {API_CONFIG} from './config/api-config';

export const AuthInterceptorService: HttpInterceptorFn = (req, next: HttpHandlerFn) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const internalToken = authService.getInternalAccessToken();
  const oidcToken = authService.getOidcAccessToken();
  const token = internalToken || oidcToken;

  const isApiRequest = req.url.startsWith(`${API_CONFIG.BASE_URL}/api/`);
  const isSetupRequest = req.url.includes('/api/v1/setup');
  const isPublicSettingsRequest = req.url.includes('/api/v1/settings/public');

  const authReq = (token && isApiRequest && !isSetupRequest && !isPublicSettingsRequest) ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isSetupRequest && !isPublicSettingsRequest) {
        return handle401Error(authService, authReq, next, router, !!internalToken);
      }
      return throwError(() => error);
    })
  );
};

let isRefreshing = false;
const refreshTokenSubject = new BehaviorSubject<string | null>(null);

function handle401Error(authService: AuthService, request: HttpRequest<unknown>, next: HttpHandlerFn, router: Router, isInternal: boolean): Observable<HttpEvent<unknown>> {
  if (!isRefreshing && isInternal) {
    isRefreshing = true;
    refreshTokenSubject.next(null);

    return authService.internalRefreshToken().pipe(
      switchMap(response => {
        isRefreshing = false;
        const { access_token, refresh_token } = response.data;
        if (access_token && refresh_token) {
          authService.saveInternalTokens(access_token, refresh_token);
          refreshTokenSubject.next(access_token);
        }
        return next(request.clone({
          setHeaders: { Authorization: `Bearer ${access_token}` }
        }));
      }),
      catchError(err => {
        isRefreshing = false;
        forceLogout(authService, router);
        return throwError(() => err);
      })
    );
  }

  if (isRefreshing && isInternal) {
    return refreshTokenSubject.pipe(
      filter(token => token !== null),
      take(1),
      switchMap(token =>
        next(request.clone({
          setHeaders: { Authorization: `Bearer ${token}` }
        }))
      )
    );
  }

  forceLogout(authService, router, isInternal ? 'Session expired, please log in again.' : 'OIDC token expired, please log in again.');
  return throwError(() => new Error('Authentication failed, please log in.'));
}

function forceLogout(authService: AuthService, router: Router, message?: string): void {
  authService.logout();
  router.navigate(['/login']);
  if (message) console.warn(message);
}
