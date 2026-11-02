export type TagIcon = 'star' | 'heart' | 'bolt' | 'music' | 'guitar' | 'bookmark';

export interface TrackTag {
  id: string;
  name: string;
  icon: TagIcon;
  color: string;
}

export interface Tag extends TrackTag {
  trackIds: string[];
}

export interface TagInput {
  name: string;
  icon: TagIcon;
  color: string;
  trackIds: string[];
}

export const TAG_ICON_OPTIONS: { value: TagIcon; label: string; symbol: string }[] = [
  { value: 'star', label: 'Étoile', symbol: '★' },
  { value: 'heart', label: 'Cœur', symbol: '♥' },
  { value: 'bolt', label: 'Éclair', symbol: 'ϟ' },
  { value: 'music', label: 'Musique', symbol: '♫' },
  { value: 'guitar', label: 'Guitare', symbol: '♬' },
  { value: 'bookmark', label: 'Marque-page', symbol: '▮' },
];

export const TAG_COLOR_OPTIONS = [
  { value: '#9e345f', label: 'Rose' },
  { value: '#ab4b31', label: 'Terracotta' },
  { value: '#8a6812', label: 'Moutarde' },
  { value: '#35705b', label: 'Vert' },
  { value: '#326b87', label: 'Bleu' },
  { value: '#66508b', label: 'Violet' },
];
