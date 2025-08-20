import {inject, Injectable} from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import {API_CONFIG} from '../../config/api-config';

@Injectable({
  providedIn: 'root',
})
export class SetupRedirectGuard implements CanActivate {
  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/setup`;

  private http = inject(HttpClient);
  private router = inject(Router);

  canActivate(): Observable<boolean> {
    return this.http.get<{ data: { isSetupComplete: boolean } }>(`${this.url}/status`).pipe(
      map(res => {
        if (!res.data.isSetupComplete) {
          this.router.navigate(['/setup']);
        } else {
          this.router.navigate(['/dashboard']);
        }
        return false;
      }),
      catchError(() => {
        this.router.navigate(['/setup']);
        return of(false);
      })
    );
  }
}
