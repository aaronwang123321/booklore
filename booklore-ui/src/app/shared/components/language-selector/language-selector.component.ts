import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropdownModule } from 'primeng/dropdown';
import { FormsModule } from '@angular/forms';
import { I18nService, SupportedLocale } from '../../../core/service/i18n.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-language-selector',
  standalone: true,
  imports: [CommonModule, DropdownModule, FormsModule],
  template: `
    <p-dropdown
      [options]="supportedLocales"
      [(ngModel)]="selectedLocale"
      optionLabel="name"
      optionValue="code"
      (onChange)="onLanguageChange($event)"
      [style]="{ 'min-width': '150px' }"
      placeholder="Select Language"
      i18n-placeholder="@@language.selector.placeholder"
    >
      <ng-template pTemplate="selectedItem" let-selectedOption>
        <div class="flex align-items-center gap-2" *ngIf="selectedOption">
          <span>{{ selectedOption.flag }}</span>
          <span>{{ selectedOption.name }}</span>
        </div>
      </ng-template>
      <ng-template pTemplate="item" let-option>
        <div class="flex align-items-center gap-2">
          <span>{{ option.flag }}</span>
          <span>{{ option.name }}</span>
        </div>
      </ng-template>
    </p-dropdown>
  `,
  styles: [`
    :host {
      display: block;
    }
    
    .flex {
      display: flex;
    }
    
    .align-items-center {
      align-items: center;
    }
    
    .gap-2 {
      gap: 0.5rem;
    }
  `]
})
export class LanguageSelectorComponent implements OnInit {
  supportedLocales: SupportedLocale[] = [];
  selectedLocale: string = 'en-US';
  currentLocale$: Observable<string>;

  constructor(private i18nService: I18nService) {
    this.currentLocale$ = this.i18nService.getCurrentLocale();
  }

  ngOnInit(): void {
    this.supportedLocales = this.i18nService.supportedLocales;
    this.selectedLocale = this.i18nService.getCurrentLocaleValue();
    
    // Subscribe to locale changes
    this.currentLocale$.subscribe(locale => {
      this.selectedLocale = locale;
    });
  }

  onLanguageChange(event: { value: string }): void {
    const newLocale = event.value;
    if (newLocale && newLocale !== this.selectedLocale) {
      this.i18nService.setLocale(newLocale);
    }
  }
}