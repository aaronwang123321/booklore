import {Routes} from '@angular/router';
import {BookBrowserComponent} from './book/components/book-browser/book-browser.component';
import {AppLayoutComponent} from './layout/component/layout-main/app.layout.component';
import {LoginComponent} from './core/component/login/login.component';
import {AuthGuard} from './auth.guard';
import {SettingsComponent} from './settings/settings.component';
import {PdfViewerComponent} from './book/components/pdf-viewer/pdf-viewer.component';
import {EpubViewerComponent} from './book/components/epub-viewer/component/epub-viewer.component';
import {ChangePasswordComponent} from './core/component/change-password/change-password.component';
import {BookMetadataCenterComponent} from './metadata/book-metadata-center-component/book-metadata-center.component';
import {SetupComponent} from './core/setup/setup.component';
import {SetupGuard} from './core/setup/setup.guard';
import {SetupRedirectGuard} from './core/setup/setup-redirect.guard';
import {EmptyComponent} from './core/empty/empty.component';
import {LoginGuard} from './core/setup/ login.guard';
import {OidcCallbackComponent} from './core/security/oidc-callback/oidc-callback.component';
import {CbxReaderComponent} from './book/components/cbx-reader/cbx-reader.component';
import {BookdropFileReviewComponent} from './bookdrop/bookdrop-file-review-component/bookdrop-file-review.component';
import {MainDashboardComponent} from './dashboard/components/main-dashboard/main-dashboard.component';
import {AdminGuard} from './admin/admin.guard';
import {AdminDashboardComponent} from './admin/admin-dashboard/admin-dashboard.component';
import {SystemMonitoringComponent} from './admin/system-monitoring/system-monitoring.component';
import {AnalyticsComponent} from './admin/analytics/analytics.component';
import {SubscriptionPlansComponent} from './components/subscription/subscription-plans/subscription-plans.component';
import {PaymentHistoryComponent} from './components/subscription/payment-history/payment-history.component';
import {SubscriptionCheckoutComponent} from './components/subscription/subscription-checkout/subscription-checkout.component';
import {PaymentMethodsComponent} from './components/payment/payment-methods/payment-methods.component';
import {InvoiceViewerComponent} from './components/payment/invoice-viewer/invoice-viewer.component';
import {PaymentAnalyticsComponent} from './components/analytics/payment-analytics/payment-analytics.component';

export const routes: Routes = [
  {
    path: '',
    canActivate: [SetupRedirectGuard],
    pathMatch: 'full',
    component: EmptyComponent
  },
  {
    path: 'setup',
    component: SetupComponent,
    canActivate: [SetupGuard]
  },
  {path: 'oauth2-callback', component: OidcCallbackComponent},
  {
    path: '',
    component: AppLayoutComponent,
    children: [
      {path: 'dashboard', component: MainDashboardComponent, canActivate: [AuthGuard]},
      {path: 'all-books', component: BookBrowserComponent, canActivate: [AuthGuard]},
      {path: 'settings', component: SettingsComponent, canActivate: [AuthGuard]},
      {
        path: 'admin',
        canActivate: [AdminGuard],
        children: [
          { path: '', component: AdminDashboardComponent },
          { path: 'dashboard', component: AdminDashboardComponent },
          { path: 'system-monitor', component: SystemMonitoringComponent },
          { path: 'analytics', component: AnalyticsComponent },
          { path: 'payment-analytics', component: PaymentAnalyticsComponent }
        ]
      },
      // Subscription routes
      {path: 'subscription', component: SubscriptionPlansComponent, canActivate: [AuthGuard]},
      {path: 'subscription/plans', component: SubscriptionPlansComponent, canActivate: [AuthGuard]},
      {path: 'subscription/history', component: PaymentHistoryComponent, canActivate: [AuthGuard]},
      {path: 'subscription/checkout', component: SubscriptionCheckoutComponent, canActivate: [AuthGuard]},
      // Payment routes
      {path: 'payment/methods', component: PaymentMethodsComponent, canActivate: [AuthGuard]},
      {path: 'payment/invoice/:invoiceId', component: InvoiceViewerComponent, canActivate: [AuthGuard]},
      {path: 'library/:libraryId/books', component: BookBrowserComponent, canActivate: [AuthGuard]},
      {path: 'shelf/:shelfId/books', component: BookBrowserComponent, canActivate: [AuthGuard]},
      {path: 'unshelved-books', component: BookBrowserComponent, canActivate: [AuthGuard]},
      { path: 'magic-shelf/:magicShelfId/books', component: BookBrowserComponent, canActivate: [AuthGuard] },
      {path: 'book/:bookId', component: BookMetadataCenterComponent, canActivate: [AuthGuard]},
      {path: 'bookdrop', component: BookdropFileReviewComponent, canActivate: [AuthGuard]}
    ]
  },
  {
    path: 'pdf-viewer/book/:bookId',
    component: PdfViewerComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'epub-viewer/book/:bookId',
    component: EpubViewerComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'cbx-viewer/book/:bookId',
    component: CbxReaderComponent,
    canActivate: [AuthGuard]
  },
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [LoginGuard]
  },
  {
    path: 'change-password',
    component: ChangePasswordComponent
  },
  {
    path: '**',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
