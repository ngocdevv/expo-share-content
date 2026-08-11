import { NativeModule, registerWebModule } from 'expo';

import type { ExpoShareContentModuleEvents, SharePayload } from './ExpoShareContent.types';

class ExpoShareContentModule extends NativeModule<ExpoShareContentModuleEvents> {
  async getPendingSharesAsync(): Promise<SharePayload[]> {
    return [];
  }

  async clearPendingSharesAsync(_shareIds: string[] | null): Promise<void> {}

  async releaseSharedFilesAsync(_shareIds: string[]): Promise<void> {}
}

export default registerWebModule(ExpoShareContentModule, 'ExpoShareContent');
