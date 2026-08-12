import { createShareContentApi, type ShareContentNativeModule } from './createShareContentApi';

let resolvedNativeModule: ShareContentNativeModule | undefined;

function getNativeModule(): ShareContentNativeModule {
  if (!resolvedNativeModule) {
    // Keep package loading Node/CommonJS-safe for tooling. Expo's native module is
    // resolved only when an API method is invoked inside an Expo runtime.
    resolvedNativeModule = (
      require('./ExpoShareContentModule') as { default: ShareContentNativeModule }
    ).default;
  }
  return resolvedNativeModule;
}

const lazyNativeModule = new Proxy({} as ShareContentNativeModule, {
  get(_target, property) {
    const nativeModule = getNativeModule() as unknown as Record<PropertyKey, unknown>;
    const value = nativeModule[property];
    return typeof value === 'function' ? value.bind(nativeModule) : value;
  },
});

const ExpoShareContent = createShareContentApi(lazyNativeModule);

export const {
  addShareErrorListener,
  addShareListener,
  clearPendingSharesAsync,
  getInitialShareAsync,
  getPendingSharesAsync,
  releaseSharedFilesAsync,
} = ExpoShareContent;

export default ExpoShareContent;
