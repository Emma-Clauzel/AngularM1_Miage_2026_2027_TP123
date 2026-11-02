import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../shared/services/auth.service';
import { ProfileAvatar } from '../../shared/models/profile-avatar.model';
import { AvatarPickerComponent } from '../avatar-picker/avatar-picker';

@Component({
  imports: [ReactiveFormsModule, RouterLink, AvatarPickerComponent],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.css',
})
export class ProfilePageComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly form = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    avatar: new FormControl<ProfileAvatar>('cat', { nonNullable: true }),
  });

  ngOnInit(): void {
    this.load();
  }

  setAvatar(avatar: ProfileAvatar): void {
    this.form.controls.avatar.setValue(avatar);
    this.form.controls.avatar.markAsDirty();
  }

  load(): void {
    if (this.loading() || this.saving()) return;
    this.loading.set(true);
    this.error.set('');
    this.message.set('');
    this.auth.profile().subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name, avatar: user.avatar ?? 'cat' });
        this.form.markAsPristine();
        this.message.set('Profil chargé.');
      },
      error: () => { this.loading.set(false); this.error.set('Impossible de charger ton profil. R\u00e9essaie.'); },
      complete: () => this.loading.set(false),
    });
  }

  save(): void {
    if (this.form.invalid || this.saving() || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }
    const name = this.form.getRawValue().name.trim();
    if (!name) {
      this.form.controls.name.setErrors({ required: true });
      this.form.controls.name.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.message.set('');
    this.auth.update(name, this.form.getRawValue().avatar).subscribe({
      next: (user) => {
        this.form.setValue({ name: user.name, avatar: user.avatar ?? 'cat' });
        this.form.markAsPristine();
        this.message.set('Ton profil a été mis à jour.');
      },
      error: (error: unknown) => {
        console.error('[ProfilePage] Enregistrement du profil impossible', error);
        this.saving.set(false);
        this.error.set(this.saveErrorMessage(error));
      },
      complete: () => this.saving.set(false),
    });
  }

  private saveErrorMessage(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const serverMessage = error.error && typeof error.error.message === 'string'
        ? error.error.message
        : '';
      if (serverMessage) return serverMessage;
      if (error.status === 0) return 'Le serveur est injoignable. Vérifie que le backend est lancé.';
      if (error.status === 401) return 'Ta session a expiré. Reconnecte-toi puis réessaie.';
      return `L’enregistrement a échoué (erreur HTTP ${error.status}). Réessaie.`;
    }
    return 'Une erreur inattendue a empêché l’enregistrement du profil.';
  }
}
