import {inject, Injectable} from '@angular/core';
import {
  CanActivate,
  Router,
  UrlTree
} from '@angular/router';
import {Observable, of} from 'rxjs';
import {map, catchError} from 'rxjs/operators';
import {HttpClient} from '@angular/common/http';
import {API_CONFIG} from '../../config/api-config';

@Injectable({
  providedIn: 'root'
})
export class SetupGuard implements CanActivate {

  private readonly url = `${API_CONFIG.BASE_URL}/api/v1/setup`;

  private http = inject(HttpClient);
  private router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return this.http.get<{ data: { isSetupComplete: boolean } }>(`${this.url}/status`).pipe(
      map(response => {
        if (response?.data?.isSetupComplete === true) {
          return this.router.createUrlTree(['/login']);
        }
        return true;
      }),
      catchError(() => {
        return of(true);
      })
    );
  }
}
