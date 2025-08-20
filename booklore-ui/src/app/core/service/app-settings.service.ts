import {Injectable} from '@angular/core';
import {HttpClient, HttpErrorResponse} from '@angular/common/http';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {AppSettings} from '../model/app-settings.model';
import {API_CONFIG} from '../../config/api-config';
import {catchError, map} from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AppSettingsService {
  private readonly apiUrl = `${API_CONFIG.BASE_URL}/api/v1/settings`;
  private readonly publicApiUrl = `${API_CONFIG.BASE_URL}/api/v1/settings/public`;

  private appSettingsSubject = new BehaviorSubject<AppSettings | null>(null);
  appSettings$ = this.appSettingsSubject.asObservable();

  constructor(private http: HttpClient) {
    // Don't load settings automatically - wait for authentication
  }

  loadAppSettings(): void {
    this.http.get<{data: {settings: {name: string, value: string}[], total: number}}>(this.publicApiUrl).subscribe({
      next: (response) => {
        // Convert settings array to AppSettings object
        const settings = this.convertSettingsArrayToObject(response.data.settings);
        this.appSettingsSubject.next(settings);
      },
      error: (error: HttpErrorResponse) => {
        // Only log error if it's not a 401/403 (authentication/authorization error)
        if (error.status !== 401 && error.status !== 403) {
          console.error('Error loading app settings:', error);
        }
        this.appSettingsSubject.next(null);
      }
    });
  }

  private convertSettingsArrayToObject(settingsArray: {name: string, value: string}[]): AppSettings {
    // Create default settings object
    const defaultSettings: AppSettings = {
      autoBookSearch: false,
      similarBookRecommendation: false,
      metadataRefreshOptions: {
        allP4: null,
        allP3: null,
        allP2: null,
        allP1: null,
        refreshCovers: false,
        mergeCategories: false,
        reviewBeforeApply: false
      },
      coverResolution: 'medium',
      uploadPattern: '',
      movePattern: '',
      opdsServerEnabled: false,
      remoteAuthEnabled: false,
      oidcEnabled: false,
      oidcProviderDetails: {
        providerName: '',
        clientId: '',
        issuerUri: '',
        claimMapping: {
          username: 'preferred_username',
          email: 'email',
          name: 'given_name'
        }
      },
      oidcAutoProvisionDetails: {
        enableAutoProvisioning: false,
        defaultPermissions: [],
        defaultLibraryIds: []
      },
      cbxCacheSizeInMb: 100,
      maxFileUploadSizeInMb: 100,
      metadataProviderSettings: {
        amazon: { enabled: false, cookie: '', domain: 'amazon.com' },
        google: { enabled: false },
        goodReads: { enabled: false },
        hardcover: { enabled: false, apiKey: '' }
      },
      metadataMatchWeights: {
        title: 1,
        subtitle: 1,
        description: 1,
        authors: 1,
        publisher: 1,
        publishedDate: 1,
        seriesName: 1,
        seriesNumber: 1,
        seriesTotal: 1,
        isbn13: 1,
        isbn10: 1,
        language: 1,
        pageCount: 1,
        categories: 1,
        amazonRating: 1,
        amazonReviewCount: 1,
        goodreadsRating: 1,
        goodreadsReviewCount: 1,
        hardcoverRating: 1,
        hardcoverReviewCount: 1,
        coverImage: 1
      },
      metadataPersistenceSettings: {
        saveToOriginalFile: false,
        backupMetadata: false,
        backupCover: false
      },
      metadataDownloadOnBookdrop: false
    };

    // Override with actual settings from the array
    settingsArray.forEach(setting => {
      if (setting.name && setting.value !== undefined) {
        this.setNestedProperty(defaultSettings as unknown, setting.name, setting.value);
      }
    });

    return defaultSettings;
  }

  private setNestedProperty(obj: any, path: string, value: string): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }

    const lastKey = keys[keys.length - 1];
    try {
      // Try to parse JSON values
      current[lastKey] = typeof value === 'string' ? JSON.parse(value) : value;
    } catch {
      // If parsing fails, use the value as-is
      current[lastKey] = value;
    }
  }

  saveSettings(settings: { key: string, newValue: unknown }[]): Observable<void> {
    const payload = settings.map(setting => ({
      name: setting.key,
      value: setting.newValue
    }));

    return this.http.put<void>(this.apiUrl, payload).pipe(
      map(() => {
        this.loadAppSettings();
      }),
      catchError((err: HttpErrorResponse) => {
        console.error('Error saving settings:', err);
        return of();
      })
    );
  }
}
