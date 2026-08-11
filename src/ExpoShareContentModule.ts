import { NativeModule, requireNativeModule } from 'expo';

import type { ExpoShareContentModuleEvents, SharePayload } from './ExpoShareContent.types';

declare class ExpoShareContentModule extends NativeModule<ExpoShareContentModuleEvents> {
  getPendingSharesAsync(): Promise<SharePayload[]>;
  clearPendingSharesAsync(shareIds: string[] | null): Promise<void>;
  releaseSharedFilesAsync(shareIds: string[]): Promise<void>;
}

export default requireNativeModule<ExpoShareContentModule>('ExpoShareContent');
