import { ProfileAvatar } from './profile-avatar.model';

/** Minimal account information shown on the public login page. */
export interface PublicAccount {
  id: string;
  name: string;
  email: string;
  avatar?: ProfileAvatar;
  canDeleteWithoutPassword?: boolean;
  deletable?: boolean;
}
