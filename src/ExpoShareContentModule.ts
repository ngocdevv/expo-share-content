import { NativeModule, requireNativeModule } from 'expo';

import { ExpoShareContentModuleEvents } from './ExpoShareContent.types';

declare class ExpoShareContentModule extends NativeModule<ExpoShareContentModuleEvents> {
  setValueAsync(value: string): Promise<void>;
}

export default requireNativeModule<ExpoShareContentModule>('ExpoShareContent');
