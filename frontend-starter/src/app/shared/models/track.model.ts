/** Audio track metadata returned by the API. */
export interface Track {
  id: string;
  title: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
  cover: {
    mimeType: string;
    source: 'embedded' | 'upload' | 'cover-art-archive';
    sourceUrl?: string;
    rightsConfirmed: boolean;
  } | null;
}

export interface CoverSuggestion {
  releaseId: string;
  imageId: string;
  imageUrl: string;
  title: string;
  artist: string;
  date: string;
  score: number;
}
