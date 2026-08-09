import { registerWebModule, NativeModule } from 'expo';

import { ExpoShareContentModuleEvents } from './ExpoShareContent.types';

// ExpoShareContentModule is not available on the web platform.
class ExpoShareContentModule extends NativeModule<ExpoShareContentModuleEvents> {}

export default registerWebModule(ExpoShareContentModule, 'ExpoShareContentModule');
