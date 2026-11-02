import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { ProfileAvatar } from '../../shared/models/profile-avatar.model';
import { AvatarPickerComponent } from '../avatar-picker/avatar-picker';

@Component({
  imports: [ReactiveFormsModule, RouterLink, AvatarPickerComponent],
  templateUrl: './register-page.html',
  styleUrl: './register-page.css',
})
export class RegisterPageComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(1), Validators.pattern(/\S/)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email, Validators.minLength(8)] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
    avatar: new FormControl<ProfileAvatar>('cat', { nonNullable: true }),
  });

  setAvatar(avatar: ProfileAvatar): void {
    this.form.controls.avatar.setValue(avatar);
    this.form.controls.avatar.markAsDirty();
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const values = this.form.getRawValue();
    this.auth.register(values.name.trim(), values.email.trim(), values.password, values.avatar).subscribe({
      next: () => {
        console.debug('[RegisterPage] Inscription réussie');
        this.auth.logout();
        void this.router.navigateByUrl('/login');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[RegisterPage] Échec de l’inscription', error);
        this.error.set(error.error?.message ?? 'Erreur d’inscription');
      },
    });
  }
}
