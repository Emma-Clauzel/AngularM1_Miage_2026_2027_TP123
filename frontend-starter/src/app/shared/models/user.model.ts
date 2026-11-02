import { ProfileAvatar } from './profile-avatar.model';

/** Public user data returned by the API. */
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: ProfileAvatar;
  createdAt: string;
}
