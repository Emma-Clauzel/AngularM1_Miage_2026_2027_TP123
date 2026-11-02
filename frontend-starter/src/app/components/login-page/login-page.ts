import { Component, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../shared/services/auth.service';
import { PublicAccount } from '../../shared/models/public-account.model';

@Component({
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
})
export class LoginPageComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly error = signal('');
  readonly accounts = signal<PublicAccount[]>([]);
  readonly accountsLoading = signal(true);
  readonly accountsFailed = signal(false);
  readonly pendingAccount = signal<PublicAccount | null>(null);
  readonly deletePassword = signal('');
  readonly passwordRequiredForDelete = signal(true);
  readonly deleteError = signal('');
  readonly deletingAccount = signal(false);
  @ViewChild('deleteAccountDialog') private deleteDialog?: ElementRef<HTMLDialogElement>;
  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  ngOnInit(): void {
    this.auth.publicAccounts().subscribe({
      next: (accounts) => {
        this.accounts.set(accounts);
        this.passwordRequiredForDelete.set(!accounts[0]?.canDeleteWithoutPassword);
      },
      error: () => {
        this.accountsFailed.set(true);
        this.accountsLoading.set(false);
      },
      complete: () => this.accountsLoading.set(false),
    });
  }

  submit(): void {
    const values = this.form.getRawValue();
    this.auth.login(values.email, values.password).subscribe({
      next: () => {
        console.debug('[LoginPage] Connexion réussie');
        void this.router.navigateByUrl('/tracks');
      },
      error: (error: { error?: { message?: string } }) => {
        console.error('[LoginPage] Échec de connexion', error);
        this.error.set(error.error?.message ?? 'Erreur de connexion');
      },
    });
  }

  selectAccount(account: PublicAccount): void {
    this.form.controls.email.setValue(account.email);
    this.form.controls.password.setValue('');
  }

  openDeleteDialog(account: PublicAccount): void {
    if (this.deletingAccount()) return;
    this.pendingAccount.set(account);
    this.deletePassword.set('');
    this.deleteError.set('');
    this.deleteDialog?.nativeElement.showModal();
  }

  setDeletePassword(event: Event): void {
    this.deletePassword.set((event.target as HTMLInputElement).value);
  }

  cancelDelete(): void {
    if (this.deletingAccount()) return;
    this.deleteDialog?.nativeElement.close();
    this.resetDeleteState();
  }

  handleDialogCancel(event: Event): void {
    if (this.deletingAccount()) {
      event.preventDefault();
      return;
    }
    this.resetDeleteState();
  }

  deleteAccount(): void {
    const account = this.pendingAccount();
    const password = this.deletePassword();
    if (!account || !password || this.deletingAccount()) return;

    this.deletingAccount.set(true);
    this.deleteError.set('');
    this.auth.deletePublicAccount(account.id, password).subscribe({
      next: () => {
        this.accounts.update((accounts) => accounts.filter((item) => item.id !== account.id));
        this.deleteDialog?.nativeElement.close();
        this.resetDeleteState();
      },
      error: (error: { error?: { message?: string } }) => {
        this.deleteError.set(error.error?.message ?? 'Impossible de supprimer ce compte.');
        this.deletePassword.set('');
        this.deletingAccount.set(false);
      },
      complete: () => this.deletingAccount.set(false),
    });
  }

  private resetDeleteState(): void {
    this.pendingAccount.set(null);
    this.deletePassword.set('');
    this.deleteError.set('');
  }
}
