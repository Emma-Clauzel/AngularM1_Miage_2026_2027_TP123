export const PROFILE_AVATARS = [
  { id: 'cat', name: 'Chat' },
  { id: 'fox', name: 'Renard' },
  { id: 'panda', name: 'Panda' },
  { id: 'rabbit', name: 'Lapin' },
  { id: 'bear', name: 'Ours' },
  { id: 'raccoon', name: 'Raton laveur' },
  { id: 'owl', name: 'Hibou' },
  { id: 'frog', name: 'Tortue' },
  { id: 'penguin', name: 'Manchot' },
  { id: 'koala', name: 'Koala' },
] as const;

export type ProfileAvatar = (typeof PROFILE_AVATARS)[number]['id'];
