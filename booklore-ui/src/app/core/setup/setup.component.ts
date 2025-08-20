import {Component} from '@angular/core';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Router} from '@angular/router';
import {SetupService} from './setup.service';
import {InputText} from 'primeng/inputtext';
import {Button} from 'primeng/button';
import {Message} from 'primeng/message';

@Component({
  selector: 'app-setup',
  templateUrl: './setup.component.html',
  styleUrls: ['./setup.component.scss'],
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputText,
    Button,
    Message
  ]
})
export class SetupComponent {
  setupForm: FormGroup;
  loading = false;
  error: string | null = null;
  success = false;

  constructor(
    private fb: FormBuilder,
    private setupService: SetupService,
    private router: Router
  ) {
    this.setupForm = this.fb.group({
      name: ['', [Validators.required]],
      username: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  quickSetup(): void {
    this.loading = true;
    this.error = null;

    const quickSetupData = {
      username: 'admin',
      email: 'branch.wang@gmail.com',
      password: 'Bb**800217',
      displayName: 'Administrator'
    };

    this.setupService.createAdmin(quickSetupData).subscribe({
      next: () => {
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.loading = false;
        this.error =
          err?.error?.message || 'Failed to create admin user. Try again.';
      },
    });
  }

  onSubmit(): void {
    if (this.setupForm.invalid) return;

    this.loading = true;
    this.error = null;

    const formData = {
      username: this.setupForm.value.username,
      email: this.setupForm.value.email,
      password: this.setupForm.value.password,
      displayName: this.setupForm.value.name
    };

    this.setupService.createAdmin(formData).subscribe({
      next: () => {
        this.success = true;
        setTimeout(() => this.router.navigate(['/login']), 1500);
      },
      error: (err) => {
        this.loading = false;
        this.error =
          err?.error?.message || 'Failed to create admin user. Try again.';
      },
    });
  }
}
