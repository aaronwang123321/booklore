import { Injectable, LOCALE_ID, Inject } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { DOCUMENT } from '@angular/common';

export interface SupportedLocale {
  code: string;
  name: string;
  flag: string;
  rtl?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private readonly STORAGE_KEY = 'booklore_locale';
  private currentLocaleSubject = new BehaviorSubject<string>('en-US');
  
  readonly supportedLocales: SupportedLocale[] = [
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'zh-CN', name: '中文', flag: '🇨🇳' },
    { code: 'ja-JP', name: '日本語', flag: '🇯🇵' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'es-ES', name: 'Español', flag: '🇪🇸' }
  ];

  constructor(
    @Inject(LOCALE_ID) private localeId: string,
    @Inject(DOCUMENT) private document: Document
  ) {
    this.initializeLocale();
  }

  private initializeLocale(): void {
    const savedLocale = this.getSavedLocale();
    const initialLocale = savedLocale || this.localeId || 'en-US';
    this.currentLocaleSubject.next(initialLocale);
  }

  getCurrentLocale(): Observable<string> {
    return this.currentLocaleSubject.asObservable();
  }

  getCurrentLocaleValue(): string {
    return this.currentLocaleSubject.value;
  }

  getSupportedLocale(code: string): SupportedLocale | undefined {
    return this.supportedLocales.find(locale => locale.code === code);
  }

  setLocale(localeCode: string): void {
    if (this.isLocaleSupported(localeCode)) {
      this.saveLocale(localeCode);
      this.currentLocaleSubject.next(localeCode);
      
      // For runtime locale switching, we need to reload the page
      // In a production app, you might want to implement dynamic locale loading
      if (localeCode !== this.localeId) {
        this.reloadWithLocale(localeCode);
      }
    }
  }

  private isLocaleSupported(localeCode: string): boolean {
    return this.supportedLocales.some(locale => locale.code === localeCode);
  }

  private getSavedLocale(): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(this.STORAGE_KEY);
    }
    return null;
  }

  private saveLocale(localeCode: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, localeCode);
    }
  }

  private reloadWithLocale(localeCode: string): void {
    const baseHref = this.getBaseHrefForLocale(localeCode);
    const currentPath = this.document.location.pathname;
    const newUrl = `${baseHref}${currentPath.replace(/^\/[a-z]{2}(-[A-Z]{2})?/, '')}`;
    this.document.location.href = newUrl;
  }

  private getBaseHrefForLocale(localeCode: string): string {
    const localeMap: Record<string, string> = {
      'en-US': '/',
      'zh-CN': '/zh/',
      'ja-JP': '/ja/',
      'fr-FR': '/fr/',
      'de-DE': '/de/',
      'es-ES': '/es/'
    };
    return localeMap[localeCode] || '/';
  }

  getDirection(): 'ltr' | 'rtl' {
    const locale = this.getSupportedLocale(this.getCurrentLocaleValue());
    return locale?.rtl ? 'rtl' : 'ltr';
  }

  formatDate(date: Date, options?: Intl.DateTimeFormatOptions): string {
    return new Intl.DateTimeFormat(this.getCurrentLocaleValue(), options).format(date);
  }

  formatNumber(number: number, options?: Intl.NumberFormatOptions): string {
    return new Intl.NumberFormat(this.getCurrentLocaleValue(), options).format(number);
  }

  formatCurrency(amount: number, currency: string = 'USD'): string {
    return new Intl.NumberFormat(this.getCurrentLocaleValue(), {
      style: 'currency',
      currency: currency
    }).format(amount);
  }
}