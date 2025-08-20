import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../core/service/auth.service';
import { UserService } from '../settings/user-management/user.service';
import { map, take, filter } from 'rxjs/operators';
import { Observable, of } from 'rxjs';

export const AdminGuard: CanActivateFn = (): Observable<boolean> => {
  const router = inject(Router);
  const authService = inject(AuthService);
  const userService = inject(UserService);

  // 首先检查用户是否已登录
  const internalAccessToken = authService.getInternalAccessToken();
  if (!internalAccessToken) {
    router.navigate(['/login']);
    return of(false);
  }

  // 如果用户信息还没有加载，先加载用户信息
  const currentUser = userService.getCurrentUser();
  if (!currentUser) {
    userService.loadCurrentUser();
  }

  // 等待用户信息加载完成，然后检查是否为管理员
  return userService.userState$.pipe(
    filter(user => user !== null), // 等待用户信息加载完成
    take(1), // 只取第一个值
    map(user => {
      if (user && user.role === 'ADMIN') {
        return true;
      } else {
        // 非管理员用户重定向到仪表板
        router.navigate(['/dashboard']);
        return false;
      }
    })
  );
};
