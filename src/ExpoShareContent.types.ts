export type SharedContentType = 'text' | 'url' | 'image' | 'video' | 'audio' | 'file';

export type ShareSource = 'share-sheet';

export type SharedContentItem = {
  /** Stable identifier within a single share payload. */
  id: string;
  type: SharedContentType;
  mimeType: string | null;
  text?: string;
  /** Durable local file URI copied into app-owned cache storage. */
  uri?: string;
  fileName?: string;
  size?: number;
};

export type SharePayload = {
  /** Stable identifier used to deduplicate cold-start and live events. */
  id: string;
  timestamp: number;
  source: ShareSource;
  title?: string;
  items: SharedContentItem[];
};

export type ShareErrorEvent = {
  code: string;
  message: string;
};

export type ExpoShareContentModuleEvents = {
  onShareReceived: (payload: SharePayload) => void;
  onShareError: (error: ShareErrorEvent) => void;
};

export type ShareSubscription = {
  remove(): void;
};
