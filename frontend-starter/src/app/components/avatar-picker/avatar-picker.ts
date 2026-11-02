import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { PROFILE_AVATARS, ProfileAvatar } from '../../shared/models/profile-avatar.model';

@Component({
  selector: 'app-avatar-picker',
  templateUrl: './avatar-picker.html',
  styleUrl: './avatar-picker.css',
})
export class AvatarPickerComponent {
  @Input() value: ProfileAvatar = 'cat';
  @Input() buttonLabel = 'Choisir une photo de profil';
  @Output() readonly valueChange = new EventEmitter<ProfileAvatar>();
  @ViewChild('avatarDialog') private avatarDialog?: ElementRef<HTMLDialogElement>;

  readonly avatars = PROFILE_AVATARS;

  open(): void {
    this.avatarDialog?.nativeElement.showModal();
  }

  close(): void {
    this.avatarDialog?.nativeElement.close();
  }

  choose(avatar: ProfileAvatar): void {
    if (avatar !== this.value) this.valueChange.emit(avatar);
    this.close();
  }
}
