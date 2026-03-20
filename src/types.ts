export interface Recording {
  id: string;
  timestamp: number;
  duration: number;
  blobUrl: string;
  transcript?: string;
}

export type View = 'main' | 'recordings' | 'nebula' | 'fragment';
